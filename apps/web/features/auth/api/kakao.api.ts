import { z } from "zod";
import { ApiError } from "@/shared/http/api-error";
import type { SessionRequest } from "../types/auth.types";
const statusSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["login", "signup", "existing", "link"]),
  email: z.string().nullable(),
  trustedEmail: z.boolean(),
  next: z.string(),
  expiresAt: z.iso.datetime(),
});
export type KakaoStatus = z.infer<typeof statusSchema>;
export async function kakaoStatus(
  request: SessionRequest,
  signal: AbortSignal,
) {
  const parsed = statusSchema.safeParse(
    await request("/api/v1/auth/kakao/status", { method: "POST", signal }),
  );
  if (!parsed.success) throw new ApiError("", 200, "INVALID_RESPONSE");
  return parsed.data;
}
export async function startKakao(
  request: SessionRequest,
  input: { next: string } | { password: string; consent: boolean },
  signal: AbortSignal,
) {
  const result = await request<{ authorizationUrl: string }>(
    "password" in input
      ? "/api/v1/auth/kakao/link/start"
      : "/api/v1/auth/kakao/start",
    { method: "POST", body: JSON.stringify(input), signal },
  );
  const parsed = z.url().safeParse(result.authorizationUrl);
  if (!parsed.success) throw new ApiError("", 200, "INVALID_RESPONSE");
  const url = new URL(parsed.data);
  if (
    url.origin !== "https://kauth.kakao.com" ||
    url.pathname !== "/oauth/authorize" ||
    url.username ||
    url.password
  )
    throw new ApiError("", 200, "INVALID_RESPONSE");
  return url.toString();
}
export const cancelKakao = (request: SessionRequest, id: string) =>
  request<void>("/api/v1/auth/kakao/cancel", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
export const confirmKakaoLink = (
  request: SessionRequest,
  signal: AbortSignal,
) =>
  request<void>("/api/v1/auth/kakao/link/confirm", { method: "POST", signal });
export const kakaoConnectionOptions = (
  request: SessionRequest,
  accountId: string,
) => ({
  queryKey: ["user", accountId, "kakao-connection"],
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const result = z
      .object({ linked: z.boolean(), canLink: z.boolean() })
      .safeParse(await request("/api/v1/auth/kakao/connection", { signal }));
    if (!result.success) throw new ApiError("", 200, "INVALID_RESPONSE");
    return result.data;
  },
  retry: false as const,
});
