import "client-only";
import { ApiError } from "./api-error";

// Browser-only GET transport. Server cookies and API_URL do not belong here.
export async function getApiJson(
  path: `/api/${string}`,
  {
    signal,
    timeoutMs = 3_000,
  }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<unknown> {
  if (!path.startsWith("/api/") || path.includes("\\")) {
    throw new ApiError("API 경로가 올바르지 않습니다.", 0, "INVALID_PATH");
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(path, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      throw new ApiError(
        "API 요청에 실패했습니다.",
        response.status,
        "HTTP_ERROR",
        requestId,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      if (timeout.aborted || signal?.aborted) throw error;
      throw new ApiError(
        "API 응답 형식이 올바르지 않습니다.",
        response.status,
        "INVALID_RESPONSE",
        requestId,
      );
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted)
      throw new ApiError("API 응답 시간이 초과됐습니다.", 0, "TIMEOUT");
    if (error instanceof ApiError) throw error;
    throw new ApiError("API에 연결할 수 없습니다.", 0, "NETWORK_ERROR");
  }
}
