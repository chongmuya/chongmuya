"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ownerKey, ownerWrite } from "../api/owner.api";
export function useOwnerAction<T>(accountId: string, request: SessionRequest) {
  const active = useActiveScreen(),
    cache = useQueryClient();
  return useMutation({
    mutationKey: [...ownerKey(accountId), "write"],
    mutationFn: (action: { path: string; body?: unknown; method?: string }) =>
      ownerWrite<T>(request, action.path, action.body, action.method),
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      if (active.current)
        await cache.invalidateQueries({ queryKey: ownerKey(accountId) });
    },
  });
}
