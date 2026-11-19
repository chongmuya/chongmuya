"use client";
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { createInquiry, inquiryKey } from "../api/reservations.api";
import type { CreateInquiry } from "../types/inquiry.types";
import { ApiError } from "@/shared/http/api-error";
import { eventKeys } from "@/features/events/client";

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
    networkMode: "always",
    onSuccess: async (data) => {
      if (!active.current) return;
      await cache.cancelQueries({
        queryKey: inquiryKey(accountId, eventId),
        exact: true,
      });
      if (active.current) {
        cache.setQueryData(inquiryKey(accountId, eventId), data);
        await cache.invalidateQueries({
          refetchType: onlineManager.isOnline() ? "active" : "none",
          queryKey: eventKeys.detail(accountId, eventId),
          exact: true,
        });
      }
    },
    onError: async (error) => {
      if (active.current) {
        await Promise.all([
          error instanceof ApiError && error.code === "VERSION_CONFLICT"
            ? cache.invalidateQueries({
                refetchType: onlineManager.isOnline() ? "active" : "none",
                queryKey: eventKeys.detail(accountId, eventId),
                exact: true,
              })
            : Promise.resolve(),
          cache.invalidateQueries({
            refetchType: onlineManager.isOnline() ? "active" : "none",
            queryKey: inquiryKey(accountId, eventId),
            exact: true,
          }),
        ]);
      }
    },
  });
}
