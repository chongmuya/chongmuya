import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type { EventSummary } from "../types/event-summary.types";

export function eventSummariesQuery({
  accountId,
  eventIds,
  request,
}: {
  accountId: string;
  eventIds: string[];
  request: SessionRequest;
}) {
  const ids = [...new Set(eventIds)].sort();
  return queryOptions({
    queryKey: ["user", accountId, "events", "summaries", ids],
    queryFn: async ({ signal }) => {
      if (!ids.length) return [];
      const batches = Array.from(
        { length: Math.ceil(ids.length / 100) },
        (_, page) => {
          const params = new URLSearchParams({
            eventIds: ids.slice(page * 100, (page + 1) * 100).join(","),
          });
          return request<EventSummary[]>(
            `/api/v1/settlements/summaries?${params}`,
            { signal },
          );
        },
      );
      return (await Promise.all(batches)).flat();
    },
    enabled: ids.length > 0,
    staleTime: 0,
    retry: false,
  });
}
