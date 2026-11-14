"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { linkEventGroup } from "../api/events.api";
import { eventKeys } from "../api/events.queries";
import { updateEventCache } from "../lib/update-event-cache";
import type { LinkGroupInput } from "../types/event.types";

export function useLinkEventGroup(
  accountId: string,
  eventId: string,
  request: SessionRequest,
) {
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...eventKeys.detail(accountId, eventId), "link-group"],
    mutationFn: (input: LinkGroupInput) =>
      linkEventGroup(request, eventId, input),
    retry: false,
    onSuccess: (event) => updateEventCache(cache, accountId, event, active),
  });
}
