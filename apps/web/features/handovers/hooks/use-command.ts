"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ApiError } from "@/shared/http/api-error";
import type { SessionRequest } from "@/features/auth/types";
import { command } from "../api/handovers.api";
// Transport uncertainty retains the exact command, including token/version/key.
export function useCommand<T>(
  request: SessionRequest,
  done: (value: T, body: object) => void,
) {
  const active = useActiveScreen();
  const busy = useRef(false);
  const pending = useRef<
    { path: `/api/v1/${string}`; body: object } | undefined
  >(undefined);
  const [uncertain, setUncertain] = useState(false);
  const mutation = useMutation({
    mutationFn: (v: { path: `/api/v1/${string}`; body: object }) =>
      command<T>(request, v.path, v.body),
    retry: false,
    networkMode: "always",
    onSuccess: (value, variables) => {
      if (active.current) {
        pending.current = undefined;
        setUncertain(false);
        done(value, variables.body);
      }
    },
    onSettled: () => {
      busy.current = false;
    },
    onError: (error) => {
      if (active.current) {
        const unknown =
          !(error instanceof ApiError) ||
          error.status < 400 ||
          error.status >= 500;
        setUncertain(unknown);
        if (!unknown) pending.current = undefined;
      }
    },
  });
  return {
    ...mutation,
    uncertain,
    send: (path: `/api/v1/${string}`, body: object) => {
      if (busy.current) return;
      busy.current = true;
      pending.current ??= { path, body };
      mutation.mutate(pending.current);
    },
    retry: () => {
      if (pending.current && !busy.current) {
        busy.current = true;
        mutation.mutate(pending.current);
      }
    },
  };
}
