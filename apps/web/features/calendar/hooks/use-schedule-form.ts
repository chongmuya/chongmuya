"use client";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ApiError } from "@/shared/http/api-error";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { calendarKey, saveSchedule, deleteSchedule } from "../api/calendar.api";
import { scheduleSchema, type ScheduleFields } from "../schemas/schedule";
import type { Schedule, ScheduleInput } from "../types/calendar";
export function useScheduleForm(
  accountId: string,
  request: SessionRequest,
  date: string,
  initial: Schedule | undefined,
  onDone: () => void,
  onRefresh: () => void,
) {
  const [base, setBase] = useState(initial),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [deleteUncertain, setDeleteUncertain] = useState(false),
    [conflictAction, setConflictAction] = useState<"save" | "delete">("save");
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
      setConflictAction("save");
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
    onError: (error) => {
      if (!active.current) return;
      const known =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      setDeleteUncertain(!known);
      if (known && error.status === 409) {
        setConflictAction("delete");
        setConflict(true);
        onRefresh();
      }
    },
    retry: false,
  });
  const allDay = useWatch({ control: form.control, name: "allDay" });
  const memo = useWatch({ control: form.control, name: "memo" });
  const busy = mutation.isPending || remove.isPending;
  const submit = (v: ScheduleFields, groupId?: string) => {
    if (conflict || busy || deleteUncertain) return;
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
              startsAt: new Date(`${v.date}T${v.time}:00+09:00`).toISOString(),
            }
          : {}),
        memo: v.memo,
      };
    mutation.mutate(pending.current);
  };
  const review = (initial: Schedule) => {
    setBase(initial);
    pending.current = null;
    setConflict(false);
    setUncertain(false);
    setDeleteUncertain(false);
  };
  return {
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
  };
}
