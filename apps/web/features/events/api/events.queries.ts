import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { getEvent, getEvents } from "./events.api";

export const eventKeys = {
  all: (accountId: string) => ["user", accountId, "events"] as const,
  list: (accountId: string, groupId?: string) =>
    groupId
      ? (["user", accountId, "groups", groupId, "events"] as const)
      : (["user", accountId, "events", "list"] as const),
  detail: (accountId: string, eventId: string) =>
    ["user", accountId, "events", "detail", eventId] as const,
};
export const eventsQueryOptions = (
  accountId: string,
  request: SessionRequest,
  groupId?: string,
) =>
  queryOptions({
    queryKey: eventKeys.list(accountId, groupId),
    queryFn: ({ signal }) => getEvents(request, groupId, signal),
    staleTime: 0,
    retry: false,
  });
export const eventQueryOptions = (
  accountId: string,
  eventId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: eventKeys.detail(accountId, eventId),
    queryFn: ({ signal }) => getEvent(request, eventId, signal),
    staleTime: 0,
    retry: false,
  });
