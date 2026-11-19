import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type { CalendarData, Schedule, ScheduleInput } from "../types/calendar";
import { monthRange } from "../lib/dates";
export const calendarKey = (id: string) => ["user", id, "calendar"] as const;
export const calendarQuery = (
  id: string,
  request: SessionRequest,
  month: string,
  group?: string,
  restaurant?: string,
) =>
  queryOptions({
    queryKey: [
      ...calendarKey(id),
      group ?? "personal",
      restaurant ?? "organizer",
      month,
    ],
    queryFn: ({ signal }) => {
      const { from, to } = monthRange(month);
      return request<CalendarData>(
        `/api/v1/calendar?from=${from}&to=${to}${group ? `&groupId=${group}` : ""}${restaurant ? `&restaurantId=${restaurant}` : ""}`,
        { signal },
      );
    },
    retry: false,
    staleTime: 0,
  });
export const scheduleQuery = (
  id: string,
  request: SessionRequest,
  schedule: string,
) =>
  queryOptions({
    queryKey: [...calendarKey(id), "schedule", schedule],
    queryFn: ({ signal }) =>
      request<Schedule>(`/api/v1/calendar/${schedule}`, { signal }),
    retry: false,
    staleTime: 0,
  });
export const saveSchedule = (
  request: SessionRequest,
  input: ScheduleInput,
  id?: string,
) =>
  request<Schedule>(`/api/v1/calendar${id ? `/${id}` : ""}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const deleteSchedule = (
  request: SessionRequest,
  id: string,
  expectedVersion: number,
) =>
  request(`/api/v1/calendar/${id}/delete`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
export const calendarStores = (id: string, request: SessionRequest) =>
  queryOptions({
    queryKey: ["user", id, "owner", "context"],
    queryFn: ({ signal }) =>
      request<{ restaurants: { id: string; name: string }[] }>(
        "/api/v1/owner/context",
        { signal },
      ),
    retry: false,
    staleTime: 0,
  });
