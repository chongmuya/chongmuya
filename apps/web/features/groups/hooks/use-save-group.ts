"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { renameGroup } from "../api/groups.api";
import { groupKeys } from "../api/groups.queries";
import type { Group } from "../types/group.types";
import type { GroupInput } from "../schemas/group.schema";

export function useSaveGroup(
  accountId: string,
  request: SessionRequest,
  groupId: string,
  onSaved?: (group: Group) => void,
) {
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...groupKeys.list(accountId), groupId, "save"],
    mutationFn: (input: GroupInput) => renameGroup(request, groupId, input),
    retry: false,
    onSuccess: async (group) => {
      if (!active.current) return;
      const queryKey = groupKeys.list(accountId);
      // Cancel any older list read before reconciling the write response.
      await cache.cancelQueries({ queryKey, exact: true });
      if (!active.current) return;
      cache.setQueryData<Group[]>(queryKey, (previous) =>
        previous?.map((item) => (item.id === group.id ? group : item)),
      );
      // Mark stale without making successful saves depend on another request.
      void cache.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: "none",
      });
      onSaved?.(group);
    },
  });
}
