"use client";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { Schedule } from "../types/calendar";
import { useScheduleForm } from "../hooks/use-schedule-form";
export function ScheduleForm({
  accountId,
  request,
  groupId,
  date,
  initial,
  onDone,
  onRefresh,
}: {
  accountId: string;
  request: SessionRequest;
  groupId?: string;
  date: string;
  initial?: Schedule;
  onDone: () => void;
  onRefresh: () => void;
}) {
  const {
    base,
    conflict,
    uncertain,
    deleteUncertain,
    conflictAction,
    form,
    mutation,
    remove,
    allDay,
    memo,
    busy,
    submit,
    review,
  } = useScheduleForm(accountId, request, date, initial, onDone, onRefresh);
  return (
    <form
      className="space-y-5"
      onSubmit={(event) =>
        void form.handleSubmit((v) => {
          submit(v, groupId);
        })(event)
      }
    >
      <h2 className="text-xl font-bold">
        {base ? "기타 일정 수정" : "기타 일정 추가"}
      </h2>
      <fieldset
        disabled={busy || uncertain || conflict || deleteUncertain}
        className="grid grid-cols-2 gap-4"
      >
        {(["title", "date", "time", "memo"] as const).map((field) => (
          <div
            key={field}
            className={
              field === "title" || field === "memo" ? "col-span-2" : ""
            }
          >
            <label htmlFor={`schedule-${field}`}>
              {
                {
                  title: "일정 이름",
                  date: "날짜",
                  time: "시간",
                  memo: "메모 (최대 100자)",
                }[field]
              }
            </label>
            {field === "memo" ? (
              <>
                <textarea
                  id="schedule-memo"
                  className="mt-2 min-h-28 w-full rounded-card bg-surface p-4"
                  {...form.register("memo")}
                  aria-invalid={!!form.formState.errors.memo}
                  aria-describedby="schedule-memo-error"
                />
                <p className="text-right text-xs text-muted">
                  {memo.length}/100
                </p>
              </>
            ) : (
              <Input
                className="mt-2 rounded-pill bg-surface"
                id={`schedule-${field}`}
                type={
                  field === "date" ? "date" : field === "time" ? "time" : "text"
                }
                disabled={field === "time" && allDay}
                {...form.register(field)}
                aria-invalid={!!form.formState.errors[field]}
                aria-describedby={`schedule-${field}-error`}
              />
            )}
            <p id={`schedule-${field}-error`} className="text-sm text-danger">
              {form.formState.errors[field]?.message}
            </p>
          </div>
        ))}
        <label className="col-span-2 flex gap-2">
          <input type="checkbox" {...form.register("allDay")} />
          종일 일정
        </label>
      </fieldset>
      <p className="text-xs text-muted">
        전날 오전 9시(KST)에 알림함으로 알려드려요. 이미 지난 알림 시점은
        소급하지 않아요.
      </p>
      {mutation.isError && (
        <p role="alert">
          {conflict
            ? "일정이 변경됐어요. 입력을 보존했어요. 최신 내용을 확인해 주세요."
            : uncertain
              ? "저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요."
              : "입력값을 확인해 수정한 뒤 다시 저장해 주세요."}
        </p>
      )}
      {conflict && (
        <>
          <Button variant="outline" onClick={onRefresh}>
            최신 내용 조회
          </Button>
          {initial && (
            <div className="rounded-control bg-field p-3">
              <p>
                최신: {initial.title} · {initial.date} ·{" "}
                {initial.startsAt ?? "종일"} · {initial.memo}
              </p>
              <Button
                disabled={!base || initial.version <= base.version}
                onClick={() => {
                  review(initial);
                }}
              >
                {conflictAction === "delete"
                  ? "최신 일정 확인 후 삭제 다시 시도"
                  : "최신 내용 위에 내 입력 명시적으로 재적용"}
              </Button>
            </div>
          )}
        </>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={busy || conflict || deleteUncertain}
      >
        {uncertain ? "같은 요청으로 결과 재확인" : "저장"}
      </Button>
      {base && (
        <Button
          variant="outline"
          disabled={busy || uncertain || conflict}
          onClick={() => {
            if (window.confirm("이 일정을 삭제할까요? 미발송 알림도 종료돼요."))
              remove.mutate();
          }}
        >
          {deleteUncertain ? "같은 삭제 요청으로 결과 재확인" : "일정 삭제"}
        </Button>
      )}
      {remove.isError && (
        <p role="alert">
          {conflict && conflictAction === "delete"
            ? "일정이 변경되어 삭제하지 않았어요. 최신 내용을 확인하고 삭제를 다시 결정해 주세요."
            : deleteUncertain
              ? "삭제 결과를 확인하지 못했어요. 원래 버전의 같은 삭제 요청으로 확인해 주세요."
              : "삭제 요청을 처리할 수 없어요. 입력과 현재 권한을 확인해 주세요."}
        </p>
      )}
      <Button variant="outline" onClick={onDone}>
        목록으로 돌아가기
      </Button>
    </form>
  );
}
