import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
export type HoursData = {
  version: number;
  representative: { start: string; end: string; endDayOffset: 0 | 1 } | null;
  hours: {
    days: {
      kind: "DEFAULT" | "OPEN" | "CLOSED";
      start: string;
      end: string;
      endDayOffset: 0 | 1;
    }[];
    note: string;
  };
};
export const hoursQuery = (
  account: string,
  restaurant: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: ["user", account, "owner", restaurant, "hours"],
    queryFn: ({ signal }) =>
      request<HoursData>(`/api/v1/owner/restaurants/${restaurant}/hours`, {
        signal,
      }),
    retry: false,
    staleTime: 0,
  });
export const saveHours = (
  request: SessionRequest,
  id: string,
  expectedVersion: number,
  hours: HoursData["hours"],
) =>
  request<HoursData>(`/api/v1/owner/restaurants/${id}/hours`, {
    method: "PUT",
    body: JSON.stringify({ expectedVersion, hours }),
  });
