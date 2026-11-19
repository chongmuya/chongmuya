"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { eventsQueryOptions } from "../api/events.queries";

export function useEvents(
  accountId: string,
  request: SessionRequest,
  enabled: boolean,
) {
  return useQuery({
    ...eventsQueryOptions(accountId, request),
    enabled,
  });
}
