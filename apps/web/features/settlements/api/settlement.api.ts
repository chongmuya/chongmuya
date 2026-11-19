import { queryOptions } from "@tanstack/react-query";
import type { Access, Detail } from "../types/settlement.types";
export const settlementKey = (a: Access) => [
  "user",
  a.accountId,
  "settlements",
  a.eventId,
];
export const settlementPath = (a: Access): `/api/v1/${string}` =>
  `/api/v1/events/${a.eventId}/settlement`;
export const settlementQuery = (a: Access) =>
  queryOptions({
    queryKey: settlementKey(a),
    queryFn: ({ signal }) => a.request<Detail>(settlementPath(a), { signal }),
    retry: false,
    staleTime: 0,
  });
