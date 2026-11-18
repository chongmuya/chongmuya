"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import * as api from "../api/owner.api";
import type { MenuInput } from "../types/owner.types";
export function useBeginDraft(accountId: string, request: SessionRequest) {
  return useMutation({
    mutationKey: [...api.ownerKey(accountId), "begin-draft"],
    mutationFn: (restaurantId?: string) =>
      api.beginDraft(request, restaurantId),
    retry: false,
    gcTime: 0,
  });
}
export function useSubmitDraft(
  accountId: string,
  request: SessionRequest,
  draftId: string,
) {
  const active = useActiveScreen(),
    cache = useQueryClient();
  return useMutation({
    mutationKey: [...api.ownerKey(accountId), "submit-draft", draftId],
    mutationFn: (version: number) => api.submitDraft(request, draftId, version),
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      if (active.current)
        await cache.invalidateQueries({ queryKey: api.contextKey(accountId) });
    },
  });
}
export function useSaveMenu(
  accountId: string,
  request: SessionRequest,
  restaurantId: string,
) {
  const active = useActiveScreen(),
    cache = useQueryClient();
  return useMutation({
    mutationKey: [...api.menusKey(accountId, restaurantId), "save"],
    mutationFn: (input: { version: number; menu: MenuInput }) =>
      api.saveMenu(request, restaurantId, input),
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      if (active.current)
        await Promise.all([
          cache.invalidateQueries({
            queryKey: api.menusKey(accountId, restaurantId),
          }),
          cache.invalidateQueries({ queryKey: api.contextKey(accountId) }),
        ]);
    },
  });
}
