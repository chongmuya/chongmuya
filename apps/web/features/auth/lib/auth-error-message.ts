import { ApiError } from "@/shared/http/api-error";

export function authErrorMessage(error: Error) {
  return error instanceof ApiError && error.code === "INVALID_CREDENTIALS"
    ? "이메일과 비밀번호를 다시 확인해 주세요."
    : error instanceof ApiError && error.status === 429
      ? "시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요."
      : error instanceof ApiError && error.status === 409
        ? "이미 가입한 이메일입니다."
        : "요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
}
