import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { getEvent, getEvents } from "./events.api";

export const eventKeys = {
  list: (accountId: string, groupId: string) =>
    ["user", accountId, "groups", groupId, "events"] as const,
  detail: (accountId: string, groupId: string, eventId: string) =>
    [...eventKeys.list(accountId, groupId), eventId] as const,
};
export const eventsQueryOptions = (
  accountId: string,
  groupId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: eventKeys.list(accountId, groupId),
    queryFn: ({ signal }) => getEvents(request, groupId, signal),
    staleTime: 0,
    retry: false,
  });
export const eventQueryOptions = (
  accountId: string,
  groupId: string,
  eventId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: eventKeys.detail(accountId, groupId, eventId),
    queryFn: ({ signal }) => getEvent(request, groupId, eventId, signal),
    staleTime: 0,
    retry: false,
  });
