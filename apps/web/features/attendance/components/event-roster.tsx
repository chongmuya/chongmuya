"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SessionRequest } from "@/features/auth/types";
import { useEvent } from "@/features/events/client";
import { RosterEditor, personFields } from "@/features/roster/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { Button } from "@/shared/ui/button";
import { StepLayout } from "@/shared/ui/step-layout";
import { useSearchParams, useRouter } from "next/navigation";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { participantsQuery } from "../api/attendance.api";
import { useAttendanceAction } from "../hooks/use-attendance-action";
import type { ParticipantDto } from "../types/attendance.types";
export type OwnerProps = {
  accountId: string;
  eventId: string;
  request: SessionRequest;
};
export function EventRoster(props: OwnerProps) {
  const { accountId, eventId, request } = props;
  const params = useSearchParams(),
    router = useRouter();
  const adding = params.get("action") === "add";
  const editingId = params.get("participant");
  const close = () => router.replace(`/events?event=${eventId}&view=roster`);
  const roster = useQuery(participantsQuery(accountId, eventId, request)),
    event = useEvent(accountId, eventId, request);
  const action = useAttendanceAction(accountId, eventId, request),
    active = useActiveScreen();
  const [notice, setNotice] = useState<string>();
  const requestKey = useRef<string>(crypto.randomUUID());
  if ((!roster.data && roster.isError) || (!event.data && event.isError))
    return (
      <ErrorState
        retry={() => {
          void roster.refetch();
          void event.refetch();
        }}
      />
    );
  if (!roster.data || !event.data)
    return <LoadingState>행사 명단 확인 중…</LoadingState>;
  const denied = isAccessError(roster.error) || isAccessError(event.error);
  const editing = roster.data.find((person) => person.id === editingId);
  if (adding)
    return (
      <fieldset disabled={denied} className="min-w-0">
        {(roster.isError || event.isError) && (
          <p role="alert">
            {denied
              ? "명단을 수정할 권한이 없어요."
              : "최신 명단 조회에 실패했어요. 입력은 유지됩니다."}
          </p>
        )}
        <RosterEditor
          title="행사 명단 직접 입력"
          busy={action.isPending}
          onBack={close}
          onSave={async (rows) => {
            await action.mutateAsync({
              kind: "add",
              requestKey: requestKey.current,
              members: rows.map((row) => ({
                name: row.name,
                phoneLast4: row.phoneLast4 || null,
                label: row.label || null,
              })),
            });
            if (active.current) close();
          }}
        />
      </fieldset>
    );
  if (editingId)
    return (
      <StepLayout title="행사 참여자 수정" onBack={close}>
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
        <fieldset disabled={denied} className="min-w-0">
          {editing ? (
            <EditParticipant
              key={editing.id}
              {...props}
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
          {isAccessError(roster.error) || isAccessError(event.error)
            ? "이 행사 명단을 수정할 권한이 없어요."
            : "최신 명단을 불러오지 못했어요. 작성 중인 입력은 유지됩니다."}
        </p>
      )}
      <fieldset
        disabled={isAccessError(roster.error) || isAccessError(event.error)}
        className="min-w-0 space-y-5"
      >
        <div>
          <h2 className="text-xl font-bold">
            명단 관리 · {roster.data.length}명
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.data.groupId && (
            <Button
              variant="outline"
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  { kind: "import" },
                  {
                    onSuccess: (result) => {
                      if ("addedCount" in result)
                        setNotice(
                          `${result.addedCount}명 추가했어요. 이미 가져온 사람의 정보와 응답은 유지됩니다.`,
                        );
                    },
                  },
                )
              }
            >
              모임 명단 가져오기
            </Button>
          )}
          <Button
            disabled={action.isPending}
            onClick={() => {
              requestKey.current = crypto.randomUUID();
              action.reset();
              router.push(`/events?event=${eventId}&view=roster&action=add`);
            }}
          >
            직접 입력
          </Button>
        </div>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        <FormError
          message={action.error ? safeErrorMessage(action.error) : undefined}
        />
        {roster.data.length ? (
          <ol className="divide-y divide-border">
            {roster.data.map((person) => (
              <li
                key={person.id}
                className="flex items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <strong className="break-words text-sm">{person.name}</strong>
                  {(person.phoneLast4 || person.label) && (
                    <p className="text-xs text-muted">
                      {[person.phoneLast4, person.label]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <Button
                  className="shrink-0"
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/events?event=${eventId}&view=roster&participant=${person.id}`,
                    )
                  }
                >
                  수정
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-control bg-surface p-5 text-sm">
            아직 행사 명단이 없어요. 직접 입력하거나 모임 명단을 가져오세요.
          </p>
        )}
      </fieldset>
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
    ),
    active = useActiveScreen();
  return (
    <section>
      <h2 id="participant-edit-title" className="mb-4 text-xl font-bold">
        행사 참여자 수정
      </h2>
      <p className="mb-5 text-sm text-muted">
        이름이나 뒤 4자리를 바꾸면 이전 정보로 열어 둔 응답은 다시 확인해야
        해요.
      </p>
      <form
        noValidate
        className="space-y-4"
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
        {(["name", "phoneLast4", "label"] as const).map((key) => (
          <FormField
            key={key}
            id={`participant-${key}`}
            label={
              {
                name: "이름",
                phoneLast4: "뒤 4자리 (선택)",
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
                variant="pill"
              />
            )}
          </FormField>
        ))}
        <FormError
          message={action.error ? safeErrorMessage(action.error) : undefined}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={action.isPending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button type="submit" className="flex-1" loading={action.isPending}>
            저장
          </Button>
        </div>
      </form>
    </section>
  );
}
