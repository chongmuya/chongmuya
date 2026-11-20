"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { openAttendance, saveAttendance } from "../api/attendance.api";
import type {
  AttendanceAnswer,
  PublicAttendanceAccess,
  AttendanceResponseDto,
} from "../types/attendance.types";
export function usePublicAttendance(shareId: string) {
  const [access, setAccess] = useState<Omit<
      PublicAttendanceAccess,
      "accessToken"
    > | null>(null),
    [saved, setSaved] = useState<"SAVED" | "REVIEW" | null>(null);
  const token = useRef<string | null>(null),
    controller = useRef<AbortController | null>(null),
    operation = useRef<((signal: AbortSignal) => Promise<void>) | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      token.current = null;
      operation.current = null;
    },
    [],
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const action = operation.current,
        current = controller.current;
      operation.current = null;
      if (!action || !current) return;
      try {
        await action(current.signal);
      } finally {
        if (controller.current === current) controller.current = null;
      }
    },
    retry: false,
    gcTime: 0,
  });
  const run = (action: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    controller.current = new AbortController();
    operation.current = action;
    mutation.mutate();
  };
  const open = (input: { name: string; phoneLast4: string }) =>
    run(async (signal) => {
      const result = await openAttendance(shareId, input, signal);
      if (signal.aborted) return;
      token.current = result.accessToken;
      setAccess({
        kind: result.kind,
        reason: result.reason,
        response: result.response,
      });
      setSaved(null);
    });
  const save = (answer: AttendanceAnswer, onSaved?: () => void) =>
    run(async (signal) => {
      if (!token.current) return;
      const result = await saveAttendance(
        shareId,
        token.current,
        answer,
        signal,
      );
      if (signal.aborted) return;
      token.current = result.accessToken;
      setAccess((previous) => ({
        kind: result.kind === "REVIEW" ? "REVIEW" : "DIRECT",
        reason: previous?.reason ?? null,
        response: result.response as AttendanceResponseDto | null,
      }));
      setSaved(result.kind);
      onSaved?.();
    });
  const reset = () => {
    if (controller.current) return;
    token.current = null;
    setAccess(null);
    setSaved(null);
    mutation.reset();
  };
  return {
    ...mutation,
    access,
    saved,
    open,
    save,
    reset,
    clearSaved: () => setSaved(null),
  };
}
