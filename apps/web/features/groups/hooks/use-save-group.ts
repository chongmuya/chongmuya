"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { createGroup, renameGroup } from "../api/groups.api";
import { groupKeys } from "../api/groups.queries";
import type { GroupInput } from "../schemas/group.schema";
import type { Group } from "../types/group.types";

export function useSaveGroup(
  accountId: string,
  request: SessionRequest,
  groupId?: string,
  onSaved?: (group: Group) => void,
) {
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...groupKeys.list(accountId), groupId ?? "new", "save"],
    mutationFn: (input: GroupInput) =>
      groupId
        ? renameGroup(request, groupId, input)
        : createGroup(request, input),
    retry: false,
    onSuccess: async (group) => {
      if (!active.current) return;
      const queryKey = groupKeys.list(accountId);
      // Cancel any older list read before reconciling the write response.
      await cache.cancelQueries({ queryKey, exact: true });
      if (!active.current) return;
      cache.setQueryData<Group[]>(queryKey, (previous) =>
        groupId
          ? previous?.map((item) => (item.id === group.id ? group : item))
          : [...(previous ?? []).filter((item) => item.id !== group.id), group],
      );
      // Mark stale without making successful saves depend on another request.
      void cache.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: "none",
      });
      // The first group replaces the onboarding form. Run this in the same
      // guarded callback, before that cache update can unmount its observer.
      onSaved?.(group);
    },
  });
}
