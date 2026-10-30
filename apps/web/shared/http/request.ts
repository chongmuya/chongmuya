import { ApiError } from "./api-error";

export async function requestJson<T>(
  path: `/api/v1/${string}`,
  options: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/api/v1/") || path.includes("\\"))
    throw new ApiError("잘못된 API 경로입니다.", 0, "INVALID_PATH");
  const timeout = AbortSignal.timeout(10_000);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-CSRF-Protection", "1");
  try {
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code =
        body &&
        typeof body === "object" &&
        "code" in body &&
        typeof body.code === "string"
          ? body.code
          : "HTTP_ERROR";
      throw new ApiError(
        "요청을 처리하지 못했습니다.",
        response.status,
        code,
        response.headers.get("x-request-id") ?? undefined,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
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
