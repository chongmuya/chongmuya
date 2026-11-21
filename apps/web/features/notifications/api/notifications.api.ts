import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type { Inbox, Preferences } from "../types/notifications";
export const inboxKey = (id: string) => ["user", id, "notifications"] as const;
export const inboxQuery = (
  id: string,
  request: SessionRequest,
  before?: string,
) =>
  queryOptions({
    queryKey: [...inboxKey(id), "inbox", before ?? "latest"],
    queryFn: ({ signal }) =>
      request<Inbox>(
        `/api/v1/notifications${before ? `?before=${before}` : ""}`,
        { signal },
      ),
    retry: false,
    staleTime: 0,
  });
export const preferencesQuery = (id: string, request: SessionRequest) =>
  queryOptions({
    queryKey: [...inboxKey(id), "preferences"],
    queryFn: ({ signal }) =>
      request<Preferences>("/api/v1/notifications/preferences", { signal }),
    retry: false,
    staleTime: 0,
  });
export const readInbox = (request: SessionRequest, id: string) =>
  request("/api/v1/notifications/read", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
export const savePreferences = (request: SessionRequest, p: Preferences) =>
  request<Preferences>("/api/v1/notifications/preferences", {
    method: "POST",
    body: JSON.stringify({
      reservation: p.reservation,
      settlement: p.settlement,
      event: p.event,
      expectedVersion: p.version,
    }),
  });

export const unreadQuery = (id: string, request: SessionRequest) =>
  queryOptions({
    queryKey: [...inboxKey(id), "unread"],
    queryFn: ({ signal }) =>
      request<Inbox>("/api/v1/notifications/unread", { signal }),
    retry: false,
    staleTime: 0,
  });
