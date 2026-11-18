import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type {
  OwnerContext,
  RestaurantDraft,
  DuplicateResult,
  MenuInput,
  MenuList,
  PhoneChallenge,
  InquiryList,
} from "../types/owner.types";
import type {
  RegistrationData,
  VerifiedAddress,
} from "../schemas/registration.schema";
export const ownerKey = (id: string) => ["user", id, "owner"] as const;
export const contextKey = (id: string) => [...ownerKey(id), "context"] as const;
export const menusKey = (id: string, restaurantId: string) =>
  [...ownerKey(id), "menus", restaurantId] as const;
export const inquiriesKey = (id: string) =>
  [...ownerKey(id), "inquiries"] as const;
export const contextQuery = (id: string, request: SessionRequest) =>
  queryOptions({
    queryKey: contextKey(id),
    queryFn: ({ signal }) =>
      request<OwnerContext>("/api/v1/owner/context", { signal }),
    retry: false,
    staleTime: 0,
  });
export const menusQuery = (
  id: string,
  restaurantId: string,
  request: SessionRequest,
) =>
  queryOptions({
    queryKey: menusKey(id, restaurantId),
    queryFn: ({ signal }) =>
      request<MenuList>(`/api/v1/owner/restaurants/${restaurantId}/menus`, {
        signal,
      }),
    retry: false,
    staleTime: 0,
  });
export const inquiriesQuery = (id: string, request: SessionRequest) =>
  infiniteQueryOptions({
    queryKey: inquiriesKey(id),
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      request<InquiryList>(
        `/api/v1/owner/inquiries${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
    staleTime: 0,
  });
export const beginDraft = (request: SessionRequest, restaurantId?: string) =>
  request<RestaurantDraft>("/api/v1/owner/drafts", {
    method: "POST",
    body: JSON.stringify({ restaurantId }),
  });
export const getDraft = (request: SessionRequest, id: string) =>
  request<RestaurantDraft>(`/api/v1/owner/drafts/${id}`);
export type SaveDraftInput = {
  advance?: boolean;
  version: number;
  data: RegistrationData;
  step: number;
  addressId?: string;
  restaurantVersion?: number;
};
export const saveDraft = (
  request: SessionRequest,
  id: string,
  input: SaveDraftInput,
) =>
  request<RestaurantDraft>(`/api/v1/owner/drafts/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const searchAddress = (
  request: SessionRequest,
  id: string,
  query: string,
) =>
  request<{ results: VerifiedAddress[] }>(
    `/api/v1/owner/drafts/${id}/addresses`,
    { method: "POST", body: JSON.stringify({ query }) },
  );
export const checkDuplicate = (request: SessionRequest, id: string) =>
  request<DuplicateResult>(`/api/v1/owner/drafts/${id}/duplicate`, {
    method: "POST",
    body: "{}",
  });
export const startContactVerification = (
  request: SessionRequest,
  id: string,
  phone: string,
) =>
  request<PhoneChallenge>(`/api/v1/owner/drafts/${id}/contact-verification`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
export const checkContactVerification = (
  request: SessionRequest,
  id: string,
  input: { phone: string; verificationId: string },
) =>
  request<{ status: string }>(
    `/api/v1/owner/drafts/${id}/contact-verification/check`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const submitDraft = (
  request: SessionRequest,
  id: string,
  version: number,
) =>
  request<{ restaurantId: string; submitted: boolean }>(
    `/api/v1/owner/drafts/${id}/submit`,
    { method: "POST", body: JSON.stringify({ version }) },
  );
export const saveMenu = (
  request: SessionRequest,
  id: string,
  input: { version: number; menu: MenuInput },
) =>
  request<{ version: number }>(`/api/v1/owner/restaurants/${id}/menus`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
