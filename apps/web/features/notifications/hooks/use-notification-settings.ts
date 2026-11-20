"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { preferencesQuery, savePreferences } from "../api/notifications.api";
import type { Preferences } from "../types/notifications";
export function useNotificationSettings(
  accountId: string,
  request: SessionRequest,
) {
  const options = preferencesQuery(accountId, request),
    q = useQuery(options),
    cache = useQueryClient(),
    active = useActiveScreen();
  const mutation = useMutation({
    mutationFn: (p: Preferences) => savePreferences(request, p),
    onSuccess: (result) => {
      if (active.current) cache.setQueryData(options.queryKey, result);
    },
    onError: () => {
      if (active.current) void q.refetch();
    },
    retry: false,
  });
  return { q, mutation };
}
