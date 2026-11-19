"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { createEvent } from "../api/events.api";
import { eventKeys } from "../api/events.queries";
import { updateEventCache } from "../lib/update-event-cache";
import type { EventInput } from "../types/event.types";

export function useCreateEvent(accountId: string, request: SessionRequest) {
  const [creationKey] = useState(() => crypto.randomUUID());
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...eventKeys.all(accountId), "create"],
    mutationFn: (input: EventInput) =>
      createEvent(request, { ...input, creationKey }),
    retry: false,
    networkMode: "always",
    onSuccess: (event) => updateEventCache(cache, accountId, event, active),
  });
}
