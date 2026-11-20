"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { groupMembersQueryOptions } from "../api/groups.queries";

export function useGroupMembers(
  accountId: string,
  groupId: string,
  request: SessionRequest,
) {
  return useQuery(groupMembersQueryOptions(accountId, groupId, request));
}
