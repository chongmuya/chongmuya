"use client";

import { useEffect, useRef, useState } from "react";
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
  const generation = useRef(0);
  const running = useRef<AbortController | null>(null);
  const [identity, setIdentity] = useState(value);
  if (identity !== value) {
    setIdentity(value);
    setStored({ value, status: "idle" });
  }
  useEffect(() => {
    generation.current++;
    running.current?.abort();
    running.current = null;
  }, [value]);
  const reset = () => {
    generation.current++;
    running.current?.abort();
    running.current = null;
    setStored({ value: "", status: "idle" });
  };
  useEffect(
    () => () => {
      generation.current++;
      running.current?.abort();
    },
    [],
  );

  const run = async (kind: "request" | "check") => {
    const action = actions?.[kind];
    const target = getCurrentValue();
    if (!action || !target.trim() || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    const ticket = ++generation.current;
    setStored({ value: target, status: "requesting" });
    try {
      const result = await action(target, controller.signal);
      if (
        ticket !== generation.current ||
        controller.signal.aborted ||
        getCurrentValue() !== target
      )
        return;
      // A response for another identity must never certify the current input.
      setStored(
        result.value === target ? result : { value: target, status: "error" },
      );
    } catch {
      if (
        ticket === generation.current &&
        !controller.signal.aborted &&
        getCurrentValue() === target
      )
        setStored({ value: target, status: "error" });
    } finally {
      if (ticket === generation.current) running.current = null;
    }
  };
  return {
    state: stored.value === value ? stored : { value, status: "idle" as const },
    reset,
    request: () => run("request"),
    check: actions?.check ? () => run("check") : undefined,
    available: !!actions,
  };
}
