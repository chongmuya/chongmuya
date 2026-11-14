import { ApiError } from "@/shared/http/api-error";
import { getApiJson } from "@/shared/http/browser-api";

export interface Health {
  status: "ok";
  service: "chongmuya-api";
}

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const body = await getApiJson("/api/health", { signal });
  if (
    typeof body !== "object" ||
    body === null ||
    !("status" in body) ||
    body.status !== "ok" ||
    !("service" in body) ||
    body.service !== "chongmuya-api"
  ) {
    throw new ApiError(
      "Health 응답 형식이 올바르지 않습니다.",
      200,
      "INVALID_RESPONSE",
    );
  }
  return { status: body.status, service: body.service };
}
