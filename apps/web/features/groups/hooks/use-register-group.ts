"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { createGroup, addGroupMembers } from "../api/groups.api";
import { groupKeys } from "../api/groups.queries";
import type {
  CreateGroupInput,
  AddGroupMembersInput,
  AddedGroupMembers,
  Group,
} from "../types/group.types";

type Registration =
  | { kind: "create"; input: CreateGroupInput }
  | { kind: "append"; groupId: string; input: AddGroupMembersInput };
export function useRegisterGroup(
  accountId: string,
  request: SessionRequest,
  onSaved: (result: AddedGroupMembers) => void,
) {
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...groupKeys.list(accountId), "register"],
    mutationFn: async (action: Registration): Promise<AddedGroupMembers> => {
      if (action.kind === "append")
        return addGroupMembers(request, action.groupId, action.input);
      const group = await createGroup(request, action.input);
      return { group, addedCount: group.memberCount };
    },
    retry: false,
    onSuccess: async (result) => {
      if (!active.current) return;
      const listKey = groupKeys.list(accountId);
      const membersKey = groupKeys.members(accountId, result.group.id);
      await Promise.all([
        cache.cancelQueries({ queryKey: listKey, exact: true }),
        cache.cancelQueries({ queryKey: membersKey, exact: true }),
      ]);
      if (!active.current) return;
      cache.setQueryData<Group[]>(listKey, (previous) =>
        previous?.some((g) => g.id === result.group.id)
          ? previous.map((g) => (g.id === result.group.id ? result.group : g))
          : [...(previous ?? []), result.group],
      );
      void cache.invalidateQueries({
        queryKey: listKey,
        exact: true,
        refetchType: "none",
      });
      void cache.invalidateQueries({ queryKey: membersKey, exact: true });
      onSaved(result);
    },
  });
}
