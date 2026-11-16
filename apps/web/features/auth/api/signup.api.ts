import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";
import type { SessionRequest } from "../types/auth.types";
import type {
  VerificationActions,
  VerificationResult,
} from "../types/verification.types";

const termSchema = z.object({
  id: z.enum([
    "serviceTerms",
    "privacyCollection",
    "privacyPolicy",
    "marketing",
  ]),
  title: z.string(),
  required: z.boolean(),
  version: z.string(),
  url: z
    .url()
    .refine((value) => new URL(value).protocol === "https:")
    .nullable(),
  body: z.array(z.string()),
  draft: z.boolean(),
});
const verificationSchema = z.object({
  id: z.uuid(),
  phone: z.string().regex(/^010\d{8}$/),
  status: z.enum(["pending", "verified", "expired"]),
  expiresAt: z.iso.datetime(),
  retryAt: z.iso.datetime(),
  nextCheckAt: z.iso.datetime(),
  serverNow: z.iso.datetime(),
  checksRemaining: z.number().int().min(0).max(12),
  receiver: z.literal("16663538"),
  message: z.string().min(1).max(100),
  qrCode: z
    .string()
    .max(100000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      "응답 형식을 확인할 수 없습니다.",
      200,
      "INVALID_RESPONSE",
    );
  return result.data;
}
export const signupTermsOptions = (request: SessionRequest) =>
  queryOptions({
    queryKey: ["signup", "terms"],
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) =>
      parse(
        z.object({ terms: z.array(termSchema).length(4) }),
        await request("/api/v1/auth/signup/terms", { signal }),
      ).terms,
  });

function verificationResult(raw: unknown, issued = false): VerificationResult {
  const data = parse(
    issued
      ? verificationSchema
      : verificationSchema.partial({
          receiver: true,
          message: true,
          qrCode: true,
        }),
    raw,
  );
  return {
    ...data,
    value: data.phone,
    expiresAt: Date.parse(data.expiresAt),
    retryAt: Date.parse(data.retryAt),
    nextCheckAt: Date.parse(data.nextCheckAt),
    serverNow: Date.parse(data.serverNow),
  };
}
// Only the hook's local state receives challenge text/QR. Query never caches it.
export function phoneVerificationActions(
  request: SessionRequest,
): VerificationActions {
  return {
    request: async (phone, signal) => {
      await request<void>("/api/v1/auth/signup/context", {
        method: "POST",
        signal,
      });
      return verificationResult(
        await request("/api/v1/auth/signup/phone-verifications", {
          method: "POST",
          signal,
          body: JSON.stringify({ phone }),
        }),
        true,
      );
    },
    check: async (phone, signal, id) =>
      verificationResult(
        await request("/api/v1/auth/signup/phone-verifications/check", {
          method: "POST",
          signal,
          body: JSON.stringify({ id, phone }),
        }),
      ),
    cancel: (id) =>
      request<void>("/api/v1/auth/signup/phone-verifications/cancel", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ id }),
      }),
  };
}
