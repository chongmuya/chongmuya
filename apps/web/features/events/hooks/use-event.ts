"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { eventQueryOptions } from "../api/events.queries";
export function useEvent(
  accountId: string,
  eventId: string,
  request: SessionRequest,
) {
  return useQuery(eventQueryOptions(accountId, eventId, request));
}
