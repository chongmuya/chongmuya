import type { SessionRequest } from "@/features/auth/types";
import type { Event, EventInput } from "../types/event.types";

const eventsPath = (groupId: string) =>
  `/api/v1/groups/${encodeURIComponent(groupId)}/events` as const;
export const getEvents = (
  request: SessionRequest,
  groupId: string,
  signal?: AbortSignal,
) => request<Event[]>(eventsPath(groupId), { signal });
export const getEvent = (
  request: SessionRequest,
  groupId: string,
  eventId: string,
  signal?: AbortSignal,
) =>
  request<Event>(`${eventsPath(groupId)}/${encodeURIComponent(eventId)}`, {
    signal,
  });
export const createEvent = (
  request: SessionRequest,
  groupId: string,
  input: EventInput,
) =>
  request<Event>(eventsPath(groupId), {
    method: "POST",
    body: JSON.stringify(input),
  });
