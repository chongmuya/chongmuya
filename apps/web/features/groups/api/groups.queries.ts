import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { getGroups, getGroupMembers } from "./groups.api";

export const groupKeys = {
  list: (accountId: string) => ["user", accountId, "groups"] as const,
  members: (accountId: string, groupId: string) =>
    ["user", accountId, "groups", groupId, "members"] as const,
};
export const groupMembersQueryOptions = (
  accountId: string,
  groupId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: groupKeys.members(accountId, groupId),
    queryFn: ({ signal }) => getGroupMembers(request, groupId, signal),
    staleTime: 0,
    retry: false,
  });
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
