"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { createEvent } from "../api/events.api";
import { eventKeys } from "../api/events.queries";
import type { EventInput } from "../types/event.types";

export function useCreateEvent(
  accountId: string,
  groupId: string,
  request: SessionRequest,
) {
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...eventKeys.list(accountId, groupId), "create"],
    mutationFn: (input: EventInput) => createEvent(request, groupId, input),
    retry: false,
    onSuccess: async (event) => {
      if (!active.current) return;
      const queryKey = eventKeys.list(accountId, groupId);
      await cache.cancelQueries({ queryKey });
      if (!active.current) return;
      cache.setQueryData(eventKeys.detail(accountId, groupId, event.id), event);
      await cache.invalidateQueries({ queryKey, exact: true });
    },
  });
}
