"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ApiError } from "@/shared/http/api-error";
import { settlementKey, settlementPath } from "../api/settlement.api";
import type { Access, CommandResult } from "../types/settlement.types";
export function useSettlementCommand(
  a: Access,
  onApplied?: (result: CommandResult) => void,
) {
  const cache = useQueryClient(),
    active = useActiveScreen(),
    attempt = useRef<Record<string, unknown> | null>(null),
    [uncertain, setUncertain] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => {
      attempt.current ??= {
        ...structuredClone(input),
        requestKey: crypto.randomUUID(),
      };
      return a.request<CommandResult>(settlementPath(a), {
        method: "POST",
        body: JSON.stringify({ command: attempt.current }),
      });
    },
    retry: false,
    networkMode: "always",
    onSuccess: async (data) => {
      attempt.current = null;
      if (!active.current) return;
      setUncertain(false);
      await cache.cancelQueries({ queryKey: settlementKey(a) });
      if (!active.current) return;
      cache.setQueryData(settlementKey(a), data);
      void cache.invalidateQueries({
        queryKey: ["user", a.accountId, "records"],
      });
      void cache.invalidateQueries({
        queryKey: ["user", a.accountId, "files", a.eventId],
      });
      if (active.current) onApplied?.(data);
    },
    onError: (error) => {
      const rejected =
        error instanceof ApiError &&
        error.code !== "HTTP_ERROR" &&
        [400, 401, 403, 404, 409, 429].includes(error.status);
      if (rejected) attempt.current = null;
      if (!active.current) return;
      setUncertain(!rejected);
      void cache.invalidateQueries({ queryKey: settlementKey(a) });
    },
  });
  return {
    ...mutation,
    active,
    uncertain,
    retryUncertain: () => mutation.mutateAsync(attempt.current!),
  };
}
