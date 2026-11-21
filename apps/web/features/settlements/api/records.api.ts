import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type { RecordsFilter } from "../schemas/records.schema";

export const recordsQuery = (
  accountId: string,
  request: SessionRequest,
  groupId: string | null,
  filter: RecordsFilter,
  personal = false,
) =>
  queryOptions({
    queryKey: ["user", accountId, "records", groupId, filter, personal],
    queryFn: ({ signal }) => {
      const p = new URLSearchParams({ offset: String(filter.offset) });
      if (groupId) p.set("groupId", groupId);
      else if (personal) p.set("scope", "personal");
      if (filter.search) p.set("search", filter.search);
      if (filter.after) p.set("after", `${filter.after}T00:00:00+09:00`);
      if (filter.before) p.set("before", `${filter.before}T23:59:59+09:00`);
      return request<{
        count: number;
        events: {
          id: string;
          name: string;
          scheduledAt: string | null;
          attendingCount: number;
          status: "EMPTY" | "COMPLETE" | "IN_PROGRESS";
          needsReview?: boolean;
        }[];
      }>(`/api/v1/records?${p}`, { signal });
    },
    retry: false,
    staleTime: 0,
  });
