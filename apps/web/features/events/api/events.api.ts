import type { SessionRequest } from "@/features/auth/types";
import type { Event, EventInput } from "../types/event.types";

const path = "/api/v1/events";
export const getEvents = (
  request: SessionRequest,
  groupId?: string,
  signal?: AbortSignal,
) =>
  request<Event[]>(
    groupId ? `${path}?groupId=${encodeURIComponent(groupId)}` : path,
    { signal },
  );
export const getEvent = (
  request: SessionRequest,
  eventId: string,
  signal?: AbortSignal,
) => request<Event>(`${path}/${encodeURIComponent(eventId)}`, { signal });
export const createEvent = (request: SessionRequest, input: EventInput) =>
  request<Event>(path, { method: "POST", body: JSON.stringify(input) });
