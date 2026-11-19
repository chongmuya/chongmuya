"use client";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { completionKey, executeCompletion } from "../api/completion.api";
import type { CompletionAccess } from "../types/completion.types";
export function useCompletionCommand(id: string, access: CompletionAccess) {
  const cache = useQueryClient(),
    active = useActiveScreen(),
    last = useRef<{ fingerprint: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: ({
      action,
      input,
    }: {
      action: string;
      input: Record<string, unknown>;
    }) => {
      const fingerprint = JSON.stringify({ action, input });
      if (last.current?.fingerprint !== fingerprint)
        last.current = { fingerprint, key: crypto.randomUUID() };
      return executeCompletion(id, access, action, {
        ...input,
        requestKey: last.current.key,
      });
    },
    retry: false,
    networkMode: "always",
    onSuccess: async (data) => {
      if (!active.current) return;
      await cache.cancelQueries({
        queryKey: completionKey(id, access),
        exact: true,
      });
      if (!active.current) return;
      cache.setQueryData(completionKey(id, access), data);
      if (access.kind !== "link") {
        void cache.invalidateQueries({
          queryKey: ["user", access.accountId, "events"],
        });
        void cache.invalidateQueries({
          queryKey: ["user", access.accountId, "owner", "reservations"],
        });
      }
    },
    onError: () => {
      if (active.current)
        void cache.invalidateQueries({ queryKey: completionKey(id, access) });
    },
  });
  return { ...mutation, active };
}
