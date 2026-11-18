import { queryOptions } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import type { OwnerContext, RestaurantDraft } from "../types/owner.types";
export const ownerKey = (id: string) => ["user", id, "owner"] as const;
export function ownerQuery<T>(
  id: string,
  path: string,
  request: SessionRequest,
) {
  return queryOptions({
    queryKey: [...ownerKey(id), path],
    queryFn: ({ signal }) => request<T>(`/api/v1/owner/${path}`, { signal }),
    retry: false,
    staleTime: 0,
  });
}
export const contextQuery = (id: string, request: SessionRequest) =>
  ownerQuery<OwnerContext>(id, "context", request);
export const draftQuery = (
  id: string,
  draftId: string,
  request: SessionRequest,
) => ownerQuery<RestaurantDraft>(id, `drafts/${draftId}`, request);
export function ownerWrite<T>(
  request: SessionRequest,
  path: string,
  body?: unknown,
  method = "POST",
) {
  return request<T>(`/api/v1/owner/${path}`, {
    method,
    body: JSON.stringify(body ?? {}),
  });
}
