import { apiOrigin } from "./api-origin";
import { ApiError } from "./api-error";
import { parseApiError } from "./error-contract";

export async function requestJson<T>(
  path: `/api/v1/${string}`,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  if (!path.startsWith("/api/v1/") || path.includes("\\"))
    throw new ApiError("잘못된 API 경로입니다.", 0, "INVALID_PATH");
  const timeout = AbortSignal.timeout(timeoutMs);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-CSRF-Protection", "1");
  try {
    const response = await fetch(`${apiOrigin()}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
    if (!response.ok) {
      const raw = await response.text();
      let body: unknown = null;
      if (raw.length <= 32_768) {
        try {
          body = JSON.parse(raw);
        } catch {
          /* Non-JSON errors use the fallback. */
        }
      }
      throw parseApiError(
        body,
        response.status,
        response.headers.get("x-request-id") ?? undefined,
      );
    }
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch (error) {
      if (timeout.aborted || options.signal?.aborted) throw error;
      throw new ApiError(
        "응답 형식이 올바르지 않습니다.",
        response.status,
        "INVALID_RESPONSE",
      );
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "연결을 확인한 뒤 다시 시도해 주세요.",
      0,
      timeout.aborted ? "TIMEOUT" : "NETWORK_ERROR",
    );
  }
}
