"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { replyKey, saveReply, type ReplyAccess } from "../api/replies.api";
import type { MerchantReplyInput } from "../schemas/reply.schema";
export function useReplyAction(id: string, access: ReplyAccess) {
  const active = useActiveScreen(),
    cache = useQueryClient();
  return useMutation({
    mutationKey: [...replyKey(id, access), "write"],
    mutationFn: (input: MerchantReplyInput) => saveReply(id, access, input),
    retry: false,
    gcTime: 0,
    onSettled: async () => {
      if (active.current)
        await cache.invalidateQueries({ queryKey: replyKey(id, access) });
    },
  });
}
