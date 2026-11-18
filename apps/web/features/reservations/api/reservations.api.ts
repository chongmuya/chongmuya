import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type { CreateInquiry, ReservationRequest } from "../types/inquiry.types";

export const inquiryKey = (accountId: string, eventId: string) =>
  ["user", accountId, "reservation-request", eventId] as const;
export const inquiryQuery = (
  accountId: string,
  eventId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: inquiryKey(accountId, eventId),
    queryFn: ({ signal }) =>
      request<{ request: ReservationRequest | null }>(
        `/api/v1/events/${encodeURIComponent(eventId)}/reservation-requests`,
        { signal },
      ).then((result) => result.request),
    staleTime: 0,
    retry: false,
  });
export const createInquiry = (
  request: SessionRequest,
  eventId: string,
  input: CreateInquiry,
) =>
  request<ReservationRequest>(
    `/api/v1/events/${encodeURIComponent(eventId)}/reservation-requests`,
    { method: "POST", body: JSON.stringify(input) },
  );
