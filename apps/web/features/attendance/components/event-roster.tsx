"use client";
import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SessionRequest } from "@/features/auth/types";
import { useEvent } from "@/features/events/client";
import { RosterEditor, personFields } from "@/features/roster/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { Button, buttonStyles } from "@/shared/ui/button";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { StepLayout } from "@/shared/ui/step-layout";
import { useSearchParams, useRouter } from "next/navigation";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { participantsQuery, roundsQuery } from "../api/attendance.api";
import { useAttendanceAction } from "../hooks/use-attendance-action";
import type { ParticipantDto } from "../types/attendance.types";
import { ImportGroupRoster } from "./import-group-roster";
export type OwnerProps = {
  accountId: string;
  eventId: string;
  request: SessionRequest;
  rosterRoundId?: string;
};
export function EventRoster(props: OwnerProps) {
  const { accountId, eventId, request } = props;
  const params = useSearchParams(),
    router = useRouter();
  const adding = params.get("action") === "add";
  const importing = params.get("action") === "import";
  const editingId = params.get("participant");
  const rounds = useQuery({
    ...roundsQuery(accountId, eventId, request),
    refetchInterval: false,
  });
  const roundId = params.get("round") ?? rounds.data?.rounds?.[0]?.id;
  const roundTitle = rounds.data?.rounds?.find(
    (round) => round.id === roundId,
  )?.title;
  const scoped = { ...props, rosterRoundId: roundId };
  const rosterHref = `/events?event=${eventId}&view=roster${roundId ? `&round=${encodeURIComponent(roundId)}` : ""}`;
  const close = () => router.replace(rosterHref);
  const roster = useQuery({
      ...participantsQuery(accountId, eventId, request, roundId),
      enabled: !!roundId || !!rounds.data,
    }),
    event = useEvent(accountId, eventId, request);
  const needsIdentities = !!roundId && (adding || importing);
  const identities = useQuery({
    ...participantsQuery(accountId, eventId, request),
    enabled: needsIdentities,
  });
  const action = useAttendanceAction(accountId, eventId, request, roundId),
    active = useActiveScreen();
  const [notice, setNotice] = useState<string>();
  const [showAddition, setShowAddition] = useState(false);
  const [removing, setRemoving] = useState<ParticipantDto>();
  const fallback = (content: ReactNode) =>
    adding || importing || editingId ? (
      <StepLayout title="" onBack={close}>
        {content}
      </StepLayout>
    ) : (
      content
    );
  const denied =
    isAccessError(roster.error) ||
    isAccessError(event.error) ||
    isAccessError(rounds.error) ||
    (needsIdentities && isAccessError(identities.error));
  if (
    denied ||
    (!roster.data && roster.isError) ||
    (!event.data && event.isError) ||
    (!roundId && !rounds.data && rounds.isError) ||
    (needsIdentities && !identities.data && identities.isError)
  )
    return fallback(
      <ErrorState
        retry={() => {
          void roster.refetch();
          void event.refetch();
          void rounds.refetch();
          if (needsIdentities) void identities.refetch();
        }}
      >
        {denied ? "이 행사 명단에 접근할 수 없어요." : undefined}
      </ErrorState>,
    );
  const identityRows = needsIdentities ? identities.data : roster.data;
  if (!roster.data || !event.data || !identityRows)
    return fallback(<LoadingState>행사 명단 확인 중…</LoadingState>);
  const editing = roster.data.find((person) => person.id === editingId);
  if (importing && event.data.groupId)
    return (
      <ImportGroupRoster
        {...scoped}
        groupId={event.data.groupId}
        existing={roster.data}
        identities={identityRows}
        onClose={close}
        onImported={() => {
          if (!active.current) return;
          close();
        }}
      />
    );
  if (importing)
    return fallback(
      <p className="text-sm text-secondary">이 행사에 연결된 모임이 없어요.</p>,
    );
  if (adding)
    return (
      <fieldset className="min-w-0">
        {(roster.isError || event.isError) && (
          <p role="alert">최신 명단 조회에 실패했어요. 입력은 유지됩니다.</p>
        )}
        <RosterAddition {...scoped} existing={identityRows} onClose={close} />
      </fieldset>
    );
  if (editingId)
    return (
      <StepLayout title="" variant="flow" onBack={close}>
        {(roster.isError || event.isError) && (
          <ErrorState
            retry={() => {
              void roster.refetch();
              void event.refetch();
            }}
          >
            최신 명단을 확인하지 못했어요. 입력은 유지됩니다.
          </ErrorState>
        )}
        <fieldset className="min-w-0">
          {editing ? (
            <EditParticipant
              key={editing.id}
              {...scoped}
              participant={editing}
              onClose={close}
            />
          ) : (
            <p>명단에 없는 참여자예요.</p>
          )}
        </fieldset>
      </StepLayout>
    );
  return (
    <section className="space-y-5">
      {(roster.isError || event.isError) && (
        <p role="alert">
          최신 명단을 불러오지 못했어요. 작성 중인 입력은 유지됩니다.
        </p>
      )}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="text-lg font-semibold">
            {roundTitle ? `${roundTitle} 명단` : "명단 관리"} ·{" "}
            {roster.data.length}명
          </h2>
          <Button
            variant="outline"
            className="gap-2 px-3.5 text-sm"
            aria-haspopup={event.data.groupId ? "dialog" : undefined}
            disabled={action.isPending}
            onClick={() => {
              if (event.data.groupId) {
                action.reset();
                setShowAddition(true);
              } else {
                router.push(`${rosterHref}&action=add`);
              }
            }}
          >
            <Image
              src="/images/groups/roster-add.svg"
              alt=""
              width={18}
              height={18}
            />
            명단 추가
          </Button>
        </div>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {roster.data.length ? (
          <ol className="divide-y divide-border rounded-panel bg-surface px-3 shadow-control">
            {roster.data.map((person) => (
              <li
                key={person.id}
                className="flex min-h-14 items-center justify-between gap-2 pl-1"
              >
                <div className="min-w-0 py-2">
                  <strong className="text-sm wrap-anywhere">
                    {person.name}
                  </strong>
                  {(person.phoneLast4 || person.label) && (
                    <p className="text-xs wrap-anywhere text-secondary">
                      {[person.phoneLast4, person.label]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton
                    href={`${rosterHref}&participant=${person.id}`}
                    aria-label={`${person.name} 수정`}
                    className="hover:bg-soft"
                  >
                    <Image
                      src="/images/groups/edit.svg"
                      alt=""
                      width={17.0888}
                      height={17.088}
                    />
                  </IconButton>
                  <IconButton
                    aria-label={`${person.name} 삭제`}
                    aria-haspopup="dialog"
                    className="hover:bg-soft"
                    disabled={action.isPending}
                    onClick={() => {
                      action.reset();
                      setRemoving(person);
                    }}
                  >
                    <Image
                      src="/images/groups/roster-remove.svg"
                      alt=""
                      width={18}
                      height={18}
                    />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-control bg-surface p-5 text-sm">
            아직 행사 명단이 없어요. 직접 입력하거나 모임 명단을 가져오세요.
          </p>
        )}
      </div>
      {showAddition && (
        <BottomSheet
          title="명단 추가"
          busy={action.isPending}
          onClose={() => setShowAddition(false)}
        >
          <div className="space-y-2">
            <Link
              href={`${rosterHref}&action=add`}
              className={buttonStyles({ className: "w-full" })}
            >
              직접 입력
            </Link>
            <Link
              href={`${rosterHref}&action=import`}
              className={buttonStyles({
                variant: "outline",
                className: "w-full",
              })}
            >
              모임 명단에서 선택
            </Link>
            <Button
              variant="outline"
              className="w-full"
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  { kind: "import" },
                  {
                    onSuccess: (result) => {
                      if (
                        !active.current ||
                        !result ||
                        !("addedCount" in result)
                      )
                        return;
                      setShowAddition(false);
                      setNotice(`${result.addedCount}명 추가했어요.`);
                    },
                  },
                )
              }
            >
              전체 명단 가져오기
            </Button>
            <FormError
              message={
                action.error ? safeErrorMessage(action.error) : undefined
              }
            />
          </div>
        </BottomSheet>
      )}
      {removing && (
        <Dialog
          labelledBy="remove-event-participant-title"
          describedBy="remove-event-participant-description"
          busy={action.isPending}
          onClose={() => setRemoving(undefined)}
          className="space-y-4"
        >
          <h2
            id="remove-event-participant-title"
            className="text-lg font-bold wrap-anywhere"
          >
            {removing.name} 님을 삭제할까요?
          </h2>
          <p
            id="remove-event-participant-description"
            className="text-sm text-secondary"
          >
            {roundTitle
              ? `${roundTitle} 명단에서 삭제해요.`
              : "이 명단에서 삭제해요."}{" "}
            참석이나 정산 기록이 있으면 삭제할 수 없어요.
          </p>
          <FormError
            message={action.error ? safeErrorMessage(action.error) : undefined}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={action.isPending}
              onClick={() => setRemoving(undefined)}
            >
              취소
            </Button>
            <Button
              className="flex-1 border-danger bg-danger not-disabled:hover:bg-danger/90 not-disabled:active:bg-danger/80"
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  {
                    kind: "remove",
                    participantId: removing.id,
                    expectedVersion: removing.version,
                  },
                  {
                    onSuccess: () => {
                      if (!active.current) return;
                      setRemoving(undefined);
                      setNotice(
                        roundTitle
                          ? `${roundTitle} 명단에서 삭제했어요.`
                          : "명단에서 삭제했어요.",
                      );
                    },
                  },
                )
              }
            >
              삭제
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
const personSchema = z.object(personFields);
function EditParticipant({
  participant,
  onClose,
  ...props
}: OwnerProps & { participant: ParticipantDto; onClose: () => void }) {
  const [baseVersion] = useState(participant.version);
  const form = useForm({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: participant.name,
      phoneLast4: participant.phoneLast4 ?? "",
      label: participant.label ?? "",
    },
  });
  const action = useAttendanceAction(
      props.accountId,
      props.eventId,
      props.request,
      props.rosterRoundId,
    ),
    active = useActiveScreen();
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">행사 참여자 수정</h1>
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) =>
          action.mutate(
            {
              kind: "edit",
              participantId: participant.id,
              expectedVersion: baseVersion,
              person: {
                name: values.name,
                phoneLast4: values.phoneLast4 || null,
                label: values.label || null,
              },
            },
            {
              onSuccess: () => {
                if (active.current) onClose();
              },
            },
          ),
        )}
      >
        <div className="space-y-4 rounded-card bg-surface p-5 shadow-control">
          {(["name", "phoneLast4", "label"] as const).map((key) => (
            <FormField
              key={key}
              id={`participant-${key}`}
              label={
                {
                  name: "이름",
                  phoneLast4: "전화번호 뒤 4자리 (선택)",
                  label: "구분 메모 (선택)",
                }[key]
              }
              error={form.formState.errors[key]?.message}
            >
              {(attributes) => (
                <Input
                  {...attributes}
                  {...form.register(key)}
                  autoComplete="off"
                  disabled={action.isPending}
                  inputMode={key === "phoneLast4" ? "numeric" : undefined}
                  variant="form"
                />
              )}
            </FormField>
          ))}
          <p className="text-xs text-secondary">
            이름이나 전화번호 뒤 4자리를 바꾸면 이전 정보로 열어 둔 응답을 다시
            확인해야 해요.
            {props.rosterRoundId &&
              " 변경한 정보는 이 행사의 다른 차수에도 적용돼요."}
          </p>
        </div>
        <FormError
          message={action.error ? safeErrorMessage(action.error) : undefined}
        />
        <div className="space-y-2">
          <Button type="submit" className="w-full" loading={action.isPending}>
            저장
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={action.isPending}
            onClick={onClose}
          >
            취소
          </Button>
        </div>
      </form>
    </section>
  );
}

function RosterAddition({
  existing,
  onClose,
  ...props
}: OwnerProps & { existing: ParticipantDto[]; onClose: () => void }) {
  const [reviewed, setReviewed] = useState(existing);
  const key = useRef(crypto.randomUUID());
  const action = useAttendanceAction(
      props.accountId,
      props.eventId,
      props.request,
      props.rosterRoundId,
    ),
    active = useActiveScreen();
  const changed =
    JSON.stringify(existing.map((p) => [p.id, p.version])) !==
    JSON.stringify(reviewed.map((p) => [p.id, p.version]));
  return (
    <>
      {changed && (
        <div
          role="status"
          className="mb-5 rounded-control bg-choice p-4 text-sm"
        >
          <p>
            검토 후 명단이 바뀌었어요. 응답을 받지 못한 저장은 같은 내용으로
            다시 시도하면 원래 결과를 확인해요.
          </p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={action.isPending}
            onClick={() => {
              setReviewed(existing);
              key.current = crypto.randomUUID();
            }}
          >
            최신 명단으로 다시 검토
          </Button>
        </div>
      )}
      <RosterEditor
        title="행사 명단 직접 입력"
        existing={reviewed}
        busy={action.isPending}
        onBack={onClose}
        onSave={async (rows, confirmed) => {
          await action.mutateAsync({
            kind: "add",
            requestKey: key.current,
            expectedRoster: reviewed.map(({ id, version }) => ({
              id,
              version,
            })),
            duplicatesConfirmed: confirmed,
            members: rows.map((row) => ({
              name: row.name,
              phoneLast4: row.phoneLast4 || null,
              label: row.label || null,
              existingParticipantId:
                row.match && row.match !== "new" ? row.match : undefined,
              newPersonConfirmed: row.match === "new",
            })),
          });
          if (active.current) onClose();
        }}
      />
    </>
  );
}
