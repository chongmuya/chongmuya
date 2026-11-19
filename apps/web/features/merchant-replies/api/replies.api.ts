import { ApiError } from "@/shared/http/api-error";
import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/shared/http/request";
import type { SessionRequest } from "@/features/auth/types";
import type { MerchantReplyInput } from "../schemas/reply.schema";
import type { MerchantInquiry, Reply } from "../types/reply.types";
export type ReplyAccess =
  | {
      kind: "link";
      access: string;
      scope: string;
      accessExpiresAt: string;
      linkExpiresAt: string;
    }
  | { kind: "owner"; accountId: string; request: SessionRequest };
export const replyKey = (targetId: string, a: ReplyAccess) =>
  a.kind === "owner"
    ? ["user", a.accountId, "owner", "reply", targetId]
    : ["merchant-reply", targetId, a.scope];
const path = (id: string, a: ReplyAccess): `/api/v1/${string}` =>
  a.kind === "owner"
    ? `/api/v1/owner/inquiries/${id}`
    : `/api/v1/merchant-replies/${id}`;
export const replyQuery = (id: string, a: ReplyAccess) =>
  queryOptions({
    queryKey: replyKey(id, a),
    queryFn: ({ signal }) =>
      a.kind === "owner"
        ? a.request<MerchantInquiry>(path(id, a), { signal })
        : requestJson<MerchantInquiry>(path(id, a), {
            signal,
            headers: { "X-Merchant-Access": a.access },
          }),
    staleTime: 0,
    retry: false,
    gcTime: a.kind === "link" ? 0 : undefined,
  });
export function saveReply(
  id: string,
  a: ReplyAccess,
  reply: MerchantReplyInput,
) {
  if (a.kind === "link" && Date.parse(a.accessExpiresAt) <= Date.now())
    throw new ApiError("", 403, "MERCHANT_ACCESS_EXPIRED");
  const options = { method: "POST", body: JSON.stringify({ reply }) };
  return a.kind === "owner"
    ? a.request<{ version: number; response: Reply }>(path(id, a), options)
    : requestJson<{ version: number; response: Reply }>(path(id, a), {
        ...options,
        headers: { "X-Merchant-Access": a.access },
      });
}
export const exchangeLink = (
  targetId: string,
  token: string,
  signal?: AbortSignal,
) =>
  requestJson<{
    closedState?: string;
    accessToken: string;
    accessExpiresAt: string;
    linkExpiresAt: string;
  }>(`/api/v1/merchant-replies/${targetId}/access`, {
    method: "POST",
    body: JSON.stringify({ token }),
    signal,
  });

export const isMerchantAccessError = (error: unknown) =>
  error instanceof ApiError &&
  ["MERCHANT_ACCESS_EXPIRED", "MERCHANT_LINK_INVALID"].includes(
    error.code ?? "",
  );
