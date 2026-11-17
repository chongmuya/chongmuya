import { z } from "zod";
import { ApiError } from "@/shared/http/api-error";
import type { SessionRequest } from "../types/auth.types";
export async function requestPasswordReset(
  request: SessionRequest,
  email: string,
  signal: AbortSignal,
  next?: string,
) {
  const result = z.object({ accepted: z.literal(true) }).safeParse(
    await request("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email, next }),
      signal,
    }),
  );
  if (!result.success) throw new ApiError("", 202, "INVALID_RESPONSE");
}
export async function checkPasswordReset(
  request: SessionRequest,
  token: string,
  signal: AbortSignal,
) {
  const result = z
    .object({ valid: z.literal(true), expiresAt: z.iso.datetime() })
    .safeParse(
      await request("/api/v1/auth/password-reset/check", {
        method: "POST",
        body: JSON.stringify({ token }),
        signal,
      }),
    );
  if (!result.success) throw new ApiError("", 200, "INVALID_RESPONSE");
  return result.data;
}
export const savePasswordReset = (
  request: SessionRequest,
  token: string,
  password: string,
  signal: AbortSignal,
) =>
  request<void>("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, password }),
    signal,
  });
