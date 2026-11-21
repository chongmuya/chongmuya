"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { updateEvent } from "../api/events.api";
import { updateEventCache } from "../lib/update-event-cache";
import { eventKeys } from "../api/events.queries";

export function useUpdateEvent(
  accountId: string,
  eventId: string,
  request: SessionRequest,
) {
  const cache = useQueryClient(),
    active = useActiveScreen();
  return useMutation({
    mutationKey: [...eventKeys.detail(accountId, eventId), "update"],
    mutationFn: (input: Parameters<typeof updateEvent>[2]) =>
      updateEvent(request, eventId, input),
    retry: false,
    networkMode: "always",
    onSuccess: (event) => updateEventCache(cache, accountId, event, active),
    onError: () => {
      if (active.current)
        void cache.invalidateQueries({
          queryKey: eventKeys.detail(accountId, eventId),
        });
    },
  });
}
