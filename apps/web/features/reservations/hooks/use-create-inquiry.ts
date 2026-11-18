"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { createInquiry, inquiryKey } from "../api/reservations.api";
import type { CreateInquiry } from "../types/inquiry.types";

export function useCreateInquiry(
  accountId: string,
  eventId: string,
  request: SessionRequest,
) {
  const cache = useQueryClient();
  const active = useActiveScreen();
  return useMutation({
    mutationKey: [...inquiryKey(accountId, eventId), "create"],
    mutationFn: (input: CreateInquiry) =>
      createInquiry(request, eventId, input),
    retry: false,
    onSuccess: async (data) => {
      if (!active.current) return;
      await cache.cancelQueries({
        queryKey: inquiryKey(accountId, eventId),
        exact: true,
      });
      if (active.current)
        cache.setQueryData(inquiryKey(accountId, eventId), data);
    },
    onError: () => {
      if (active.current)
        void cache.invalidateQueries({
          queryKey: inquiryKey(accountId, eventId),
          exact: true,
        });
    },
  });
}
