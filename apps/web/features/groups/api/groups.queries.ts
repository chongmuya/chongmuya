import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { getGroups } from "./groups.api";

export const groupKeys = {
  list: (accountId: string) => ["user", accountId, "groups"] as const,
};
export const groupsQueryOptions = (
  accountId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: groupKeys.list(accountId),
    queryFn: ({ signal }) => getGroups(request, signal),
    staleTime: 0,
    retry: false,
  });
