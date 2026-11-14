"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { groupsQueryOptions } from "../api/groups.queries";

// Public hook keeps query keys/API implementation inside the owning feature.
export function useGroups(accountId: string, request: SessionRequest) {
  return useQuery(groupsQueryOptions(accountId, request));
}
