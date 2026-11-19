"use client";
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { eventKeys } from "@/features/events/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { inquiryKey } from "../api/reservations.api";
import type { ReservationRequest } from "../types/inquiry.types";
export function useReservationDecision(
  accountId: string,
  eventId: string,
  requestId: string,
  request: SessionRequest,
) {
  const cache = useQueryClient(),
    active = useActiveScreen();
  return useMutation({
    mutationKey: [...inquiryKey(accountId, eventId), requestId, "decision"],
    retry: false,
    networkMode: "always",
    mutationFn: (input: {
      action: "select" | "decline";
      requestKey: string;
      targetId: string;
      revision: number;
      expectedVersion: number;
    }) => {
      const { action, ...body } = input;
      return request<ReservationRequest>(
        `/api/v1/events/${eventId}/reservation-requests/${requestId}/${action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: async (data) => {
      if (!active.current) return;
      await cache.cancelQueries({
        queryKey: inquiryKey(accountId, eventId),
        exact: true,
      });
      if (active.current)
        cache.setQueryData(inquiryKey(accountId, eventId), data);
    },
    onSettled: async () => {
      if (active.current)
        await Promise.all([
          cache.invalidateQueries({
            refetchType: onlineManager.isOnline() ? "active" : "none",
            queryKey: inquiryKey(accountId, eventId),
          }),
          cache.invalidateQueries({
            refetchType: onlineManager.isOnline() ? "active" : "none",
            queryKey: eventKeys.detail(accountId, eventId),
          }),
        ]);
    },
  });
}
