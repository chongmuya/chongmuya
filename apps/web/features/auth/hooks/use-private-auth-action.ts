"use client";
import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
// Actions containing passwords/authorization URLs remain in the current call only.
export function usePrivateAuthAction() {
  const controller = useRef<AbortController | null>(null);
  const operation = useRef<((signal: AbortSignal) => Promise<void>) | null>(
    null,
  );
  useEffect(
    () => () => {
      controller.current?.abort();
      operation.current = null;
    },
    [],
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const action = operation.current,
        current = controller.current;
      operation.current = null;
      if (!action || !current || current.signal.aborted) return;
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
  return { ...mutation, run };
}
