"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
  replyKey,
  saveReply,
  isMerchantAccessError,
  type ReplyAccess,
} from "../api/replies.api";
import type { MerchantReplyInput } from "../schemas/reply.schema";
export function useReplyAction(
  id: string,
  access: ReplyAccess,
  onAccessFailure?: () => void,
) {
  const active = useActiveScreen(),
    cache = useQueryClient();
  return useMutation({
    mutationKey: [...replyKey(id, access), "write"],
    mutationFn: (input: MerchantReplyInput) => saveReply(id, access, input),
    retry: false,
    gcTime: 0,
    onError: (error) => {
      if (active.current && isMerchantAccessError(error)) onAccessFailure?.();
    },
    onSettled: async (_data, error) => {
      if (active.current && !isMerchantAccessError(error))
        await cache.invalidateQueries({ queryKey: replyKey(id, access) });
    },
  });
}
