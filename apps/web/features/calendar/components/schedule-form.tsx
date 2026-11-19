"use client";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ApiError } from "@/shared/http/api-error";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { calendarKey, saveSchedule, deleteSchedule } from "../api/calendar.api";
import { scheduleSchema, type ScheduleFields } from "../schemas/schedule";
import type { Schedule, ScheduleInput } from "../types/calendar";
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
  const [base, setBase] = useState(initial),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<ScheduleInput | null>(null),
    active = useActiveScreen(),
    cache = useQueryClient();
  const form = useForm<ScheduleFields>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      title: initial?.title ?? "",
      date: initial?.date ?? date,
      time: initial?.startsAt
        ? new Date(Date.parse(initial.startsAt) + 9 * 3600000)
            .toISOString()
            .slice(11, 16)
        : "09:00",
      allDay: initial ? !initial.startsAt : false,
      memo: initial?.memo ?? "",
    },
  });
  const mutation = useMutation({
    mutationFn: (input: ScheduleInput) =>
      saveSchedule(request, input, base?.id),
    onSuccess: async () => {
      if (!active.current) return;
      pending.current = null;
      setUncertain(false);
      await cache.invalidateQueries({ queryKey: calendarKey(accountId) });
      if (active.current) onDone();
    },
    onError: (error) => {
      if (!active.current) return;
      const known =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      setConflict(known && error.status === 409);
      if (known && error.status !== 409) pending.current = null;
      setUncertain(!known);
    },
    retry: false,
  });
  const remove = useMutation({
    mutationFn: () => deleteSchedule(request, base!.id, base!.version),
    onSuccess: () => {
      if (!active.current) return;
      onDone();
      void cache.invalidateQueries({ queryKey: calendarKey(accountId) });
    },
    retry: false,
  });
  const allDay = useWatch({ control: form.control, name: "allDay" });
  const memo = useWatch({ control: form.control, name: "memo" });
  const busy = mutation.isPending || remove.isPending;
  return (
    <form
      className="space-y-5"
      onSubmit={(event) =>
        void form.handleSubmit((v) => {
          if (conflict || busy) return;
          if (!pending.current)
            pending.current = {
              requestKey: crypto.randomUUID(),
              expectedVersion: base?.version ?? 0,
              groupId: base?.groupId ?? groupId,
              title: v.title,
              date: v.date,
              allDay: v.allDay,
              ...(!v.allDay
                ? {
                    startsAt: new Date(
                      `${v.date}T${v.time}:00+09:00`,
                    ).toISOString(),
                  }
                : {}),
              memo: v.memo,
            };
          mutation.mutate(pending.current);
        })(event)
      }
    >
      <h2 className="text-xl font-bold">
        {base ? "기타 일정 수정" : "기타 일정 추가"}
      </h2>
      <fieldset
        disabled={busy || uncertain || conflict}
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
            : "저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요."}
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
                onClick={() => {
                  setBase(initial);
                  pending.current = null;
                  setConflict(false);
                  setUncertain(false);
                }}
              >
                최신 내용 위에 내 입력 명시적으로 재적용
              </Button>
            </div>
          )}
        </>
      )}
      <Button type="submit" className="w-full" disabled={busy || conflict}>
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
          일정 삭제
        </Button>
      )}
      {remove.isError && (
        <p role="alert">
          삭제 결과를 확인하지 못했어요. 최신 내용을 확인하거나 같은 삭제를 다시
          요청해 주세요.
        </p>
      )}
      <Button variant="outline" onClick={onDone}>
        목록으로 돌아가기
      </Button>
    </form>
  );
}
