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
import { Dialog } from "@/shared/ui/dialog";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Input } from "@/shared/ui/input";
import { ErrorState, LoadingState } from "@/shared/ui/states";
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
  const roster = useQuery(participantsQuery(accountId, eventId, request)),
    event = useEvent(accountId, eventId, request);
  const action = useAttendanceAction(accountId, eventId, request),
    active = useActiveScreen();
  const [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<ParticipantDto | null>(null),
    [notice, setNotice] = useState<string>();
  const requestKey = useRef<string | null>(null);
  if (roster.isError || event.isError)
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
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">
          명단 관리 · {roster.data.length}명
        </h2>
        <p className="mt-2 text-sm text-muted">
          수정은 이 행사에만 반영돼요. 모임 명단과 이전 행사 기록은 그대로
          유지돼요.
        </p>
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
            setAdding(true);
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
                <p className="text-xs text-muted">
                  {person.phoneLast4 ?? "뒤 4자리 없음"} ·{" "}
                  {person.label ?? "메모 없음"}
                </p>
                <p className="text-xs text-secondary">
                  {person.groupMemberId
                    ? "모임에서 가져온 사람"
                    : "행사 전용 참여자"}
                </p>
              </div>
              <Button
                className="shrink-0"
                variant="outline"
                onClick={() => setEditing(person)}
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
      {adding && (
        <Dialog
          labelledBy="roster-add-title"
          className="h-svh max-h-svh w-full max-w-[440px] rounded-none bg-background p-0"
          busy={action.isPending}
          onClose={() => setAdding(false)}
        >
          <h2 id="roster-add-title" className="sr-only">
            행사 명단 직접 입력
          </h2>
          <RosterEditor
            title="행사 명단 직접 입력"
            busy={action.isPending}
            onBack={() => setAdding(false)}
            onSave={async (rows) => {
              const result = await action.mutateAsync({
                kind: "add",
                requestKey: requestKey.current!,
                members: rows.map((row) => ({
                  name: row.name,
                  phoneLast4: row.phoneLast4 || null,
                  label: row.label || null,
                })),
              });
              if (active.current) {
                setAdding(false);
                if ("addedCount" in result)
                  setNotice(`${result.addedCount}명 추가했어요.`);
              }
            }}
          />
        </Dialog>
      )}
      {editing && (
        <EditParticipant
          key={editing.id}
          {...props}
          participant={editing}
          onClose={() => setEditing(null)}
        />
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
    <Dialog
      labelledBy="participant-edit-title"
      busy={action.isPending}
      onClose={onClose}
    >
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
              expectedVersion: participant.version,
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
    </Dialog>
  );
}
