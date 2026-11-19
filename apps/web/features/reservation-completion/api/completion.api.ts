import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/shared/http/request";
import { ApiError } from "@/shared/http/api-error";
import type { Completion, CompletionAccess } from "../types/completion.types";
export const completionKey = (id: string, a: CompletionAccess) =>
  a.kind === "link"
    ? ["reservation-management", a.scope, id]
    : ["user", a.accountId, "reservation-completion", a.kind, id];
export const completionPath = (
  id: string,
  a: CompletionAccess,
): `/api/v1/${string}` =>
  a.kind === "link"
    ? `/api/v1/reservation-management/${id}`
    : a.kind === "owner"
      ? `/api/v1/owner/reservations/${id}`
      : `/api/v1/reservations/${id}`;
export function completionRequest<T>(
  a: CompletionAccess,
  path: `/api/v1/${string}`,
  options: RequestInit = {},
) {
  if (a.kind !== "link") return a.request<T>(path, options);
  if (Date.parse(a.accessExpiresAt) <= Date.now())
    throw new ApiError("", 403, "RESERVATION_ACCESS_INVALID");
  return requestJson<T>(path, {
    ...options,
    headers: { ...options.headers, "X-Reservation-Access": a.access },
  });
}
export const completionQuery = (id: string, a: CompletionAccess) =>
  queryOptions({
    queryKey: completionKey(id, a),
    queryFn: ({ signal }) =>
      completionRequest<Completion>(a, completionPath(id, a), { signal }),
    staleTime: 0,
    retry: false,
    gcTime: a.kind === "link" ? 0 : undefined,
  });
export const executeCompletion = (
  id: string,
  a: CompletionAccess,
  action: string,
  command: Record<string, unknown>,
) =>
  completionRequest<Completion>(a, `${completionPath(id, a)}/${action}`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
