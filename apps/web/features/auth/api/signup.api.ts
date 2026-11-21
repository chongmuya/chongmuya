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
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" ||
        (url.protocol === "http:" && url.origin === globalThis.location?.origin)
      );
    })
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
    queryFn: async ({ signal }) => {
      const { terms } = parse(
        z.object({ terms: z.array(termSchema).min(3).max(4) }),
        await request("/api/v1/auth/signup/terms", { signal }),
      );
      if (terms.some((term) => term.id === "privacyPolicy" && term.required))
        throw new ApiError(
          "가입 약관을 전환하고 있어요. 잠시 후 다시 시도해 주세요.",
          503,
          "SIGNUP_TERMS_UNAVAILABLE",
        );
      const consents = terms.flatMap(({ id, ...term }) =>
        id === "privacyPolicy" ? [] : [{ id, ...term }],
      );
      if (
        consents.length !== 3 ||
        new Set(consents.map((term) => term.id)).size !== 3
      )
        throw new ApiError(
          "응답 형식을 확인할 수 없습니다.",
          200,
          "INVALID_RESPONSE",
        );
      return consents;
    },
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
  prepare = () =>
    request<void>("/api/v1/auth/signup/context", { method: "POST" }),
): VerificationActions {
  return {
    request: async (phone, signal) => {
      await prepare();
      signal.throwIfAborted();
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

const emailVerificationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  status: z.enum(["pending", "verified", "expired", "failed"]),
  expiresAt: z.iso.datetime(),
  retryAt: z.iso.datetime(),
  serverNow: z.iso.datetime(),
  attemptsRemaining: z.int().min(0).max(5),
});
function emailResult(raw: unknown): VerificationResult {
  const value = parse(emailVerificationSchema, raw);
  return {
    ...value,
    value: value.email,
    deliveryFailed: value.status === "failed",
    status: value.status === "failed" ? "error" : value.status,
    expiresAt: Date.parse(value.expiresAt),
    retryAt: Date.parse(value.retryAt),
    serverNow: Date.parse(value.serverNow),
  };
}
export function emailVerificationActions(
  request: SessionRequest,
  prepare: () => Promise<void>,
): VerificationActions {
  return {
    request: async (email, signal) => {
      await prepare();
      signal.throwIfAborted();
      return emailResult(
        await request("/api/v1/auth/signup/email-verifications", {
          method: "POST",
          signal,
          body: JSON.stringify({ email }),
        }),
      );
    },
    check: async (email, signal, id, code) =>
      emailResult(
        await request("/api/v1/auth/signup/email-verifications/check", {
          method: "POST",
          signal,
          body: JSON.stringify({ id, email, code }),
        }),
      ),
    cancel: (id) =>
      request<void>("/api/v1/auth/signup/email-verifications/cancel", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ id }),
      }),
  };
}
