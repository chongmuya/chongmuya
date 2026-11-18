"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import type {
  VerificationActions,
  VerificationState,
} from "../types/verification.types";

export function useContactVerification(
  value: string,
  getCurrentValue: () => string,
  actions?: VerificationActions,
) {
  const [stored, setStored] = useState<VerificationState>({
    value: "",
    status: "idle",
  });
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [identity, setIdentity] = useState(value);
  if (identity !== value) {
    setIdentity(value);
    setStored({ value, status: "idle" });
    setError(undefined);
    setErrorCode(undefined);
  }
  const clock = useRef({ server: 0, received: 0 });
  const generation = useRef(0);
  const running = useRef<AbortController | null>(null);
  const currentId = useRef<string | undefined>(undefined);
  const cancel = useRef(actions?.cancel);
  useEffect(() => {
    cancel.current = actions?.cancel;
  }, [actions?.cancel]);
  const operation = useRef<(() => Promise<void>) | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const action = operation.current;
      operation.current = null;
      await action?.(); // No secrets in variables or returned mutation data.
    },
    retry: false,
    gcTime: 0,
  });
  const invalidate = () => {
    generation.current++;
    running.current?.abort();
    running.current = null;
    operation.current = null;
    const id = currentId.current;
    currentId.current = undefined;
    if (id) void cancel.current?.(id).catch(() => undefined);
  };
  const reset = () => {
    invalidate();
    setError(undefined);
    setErrorCode(undefined);
    setStored({ value: "", status: "idle" });
  };
  useEffect(() => {
    // Invalidate A→B→A even when an old provider response arrives afterwards.
    generation.current++;
    running.current?.abort();
    running.current = null;
    const id = currentId.current;
    currentId.current = undefined;
    if (id) void cancel.current?.(id).catch(() => undefined);
    return () => {
      running.current?.abort();
      operation.current = null;
      const latest = currentId.current;
      currentId.current = undefined;
      if (latest) void cancel.current?.(latest).catch(() => undefined);
    };
  }, [value]);
  useEffect(() => {
    if (!stored.expiresAt) return;
    const timer = setInterval(
      () =>
        setNow(
          clock.current.server + performance.now() - clock.current.received,
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [stored.expiresAt]);
  // Use the server clock plus elapsed monotonic time, not the device wall clock.
  const state: VerificationState =
    stored.value !== value
      ? { value, status: "idle" }
      : stored.expiresAt && now >= stored.expiresAt
        ? { ...stored, status: "expired" }
        : stored;
  const isVerified = () =>
    stored.value === getCurrentValue() &&
    stored.status === "verified" &&
    !!stored.id &&
    !!stored.expiresAt &&
    clock.current.server + performance.now() - clock.current.received <
      stored.expiresAt;
  const run = async (kind: "request" | "check", code?: string) => {
    const action = actions?.[kind];
    const target = getCurrentValue();
    if (!action || !target.trim() || running.current) return;
    if (
      kind === "check" &&
      (!state.id ||
        (state.nextCheckAt ?? 0) > now ||
        state.checksRemaining === 0 ||
        state.attemptsRemaining === 0 ||
        state.status === "expired")
    )
      return;
    if (kind === "request" && (state.retryAt ?? 0) > now) return;
    const controller = new AbortController();
    running.current = controller;
    const ticket = ++generation.current;
    setError(undefined);
    setErrorCode(undefined);
    setStored({ ...state, value: target, status: "requesting" });
    operation.current = async () => {
      try {
        const result = await action(target, controller.signal, state.id, code);
        if (
          ticket !== generation.current ||
          controller.signal.aborted ||
          getCurrentValue() !== target
        )
          return;
        if (result.value !== target)
          throw new Error("Invalid verification identity");
        clock.current = {
          server: result.serverNow ?? Date.now(),
          received: performance.now(),
        };
        setNow(clock.current.server);
        currentId.current = result.id;
        setStored({ ...(kind === "check" ? state : {}), ...result });
      } catch (cause) {
        if (
          ticket !== generation.current ||
          controller.signal.aborted ||
          getCurrentValue() !== target
        )
          return;
        setError(safeErrorMessage(cause));
        setErrorCode(cause instanceof ApiError ? cause.code : undefined);
        setStored({
          ...state,
          value: target,
          status:
            cause instanceof ApiError &&
            [
              "PHONE_VERIFICATION_EXPIRED",
              "EMAIL_VERIFICATION_EXPIRED",
            ].includes(cause.code)
              ? "expired"
              : "error",
          ...(cause instanceof ApiError &&
          cause.code === "PHONE_VERIFICATION_LIMIT"
            ? { checksRemaining: 0 }
            : cause instanceof ApiError &&
                cause.code === "EMAIL_VERIFICATION_LIMIT"
              ? { attemptsRemaining: 0 }
              : {}),
        });
      } finally {
        if (ticket === generation.current) running.current = null;
      }
    };
    await mutation.mutateAsync();
  };
  return {
    state,
    now,
    error,
    errorCode,
    dismissError: () => {
      setError(undefined);
      setErrorCode(undefined);
    },
    isVerified,
    reset,
    request: () => run("request"),
    check: actions?.check ? (code?: string) => run("check", code) : undefined,
    available: !!actions,
  };
}
