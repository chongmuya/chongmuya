import { z } from "zod";
import { ApiError } from "./api-error";

export const fieldErrorSchema = z
  .object({
    field: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)*$/)
      .refine(
        (value) =>
          !value
            .split(".")
            .some((part) =>
              ["__proto__", "prototype", "constructor"].includes(part),
            ),
      ),
    code: z.enum([
      "INVALID_TYPE",
      "INVALID_LENGTH",
      "INVALID_EMAIL",
      "INVALID_UUID",
      "INVALID_FORMAT",
      "INVALID_VALUE",
    ]),
  })
  .strict();
export type FieldError = z.infer<typeof fieldErrorSchema>;

const messages: Record<string, { status: number; message: string }> = {
  EMAIL_ALREADY_REGISTERED: {
    status: 409,
    message: "이미 가입한 이메일입니다.",
  },
  SIGNUP_TERMS_CHANGED: {
    status: 409,
    message: "약관이 변경되었습니다. 다시 확인하고 동의해 주세요.",
  },
  PHONE_VERIFICATION_REQUIRED: {
    status: 400,
    message: "현재 전화번호의 휴대폰 인증을 완료해 주세요.",
  },
  PHONE_VERIFICATION_INVALID: {
    status: 400,
    message: "유효하지 않은 인증 요청입니다. 다시 인증해 주세요.",
  },
  PHONE_VERIFICATION_EXPIRED: {
    status: 400,
    message: "휴대폰 인증이 만료되었습니다. 다시 인증해 주세요.",
  },
  PHONE_VERIFICATION_LIMIT: {
    status: 429,
    message: "인증 확인 횟수를 초과했습니다. 새 인증을 요청해 주세요.",
  },
  PHONE_VERIFICATION_WAIT: {
    status: 429,
    message: "인증 요청 간격을 기다린 뒤 다시 시도해 주세요.",
  },
  PHONE_VERIFICATION_UNAVAILABLE: {
    status: 503,
    message:
      "휴대폰 인증 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  },
  VALIDATION_FAILED: { status: 400, message: "입력한 항목을 확인해 주세요." },
  VERSION_CONFLICT: {
    status: 409,
    message: "행사가 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
  },
  EVENT_ALREADY_LINKED: {
    status: 409,
    message: "이미 모임에 연결된 행사입니다.",
  },
  ACCESS_EXPIRED: { status: 401, message: "로그인 상태를 다시 확인해 주세요." },
  SESSION_INVALID: { status: 401, message: "다시 로그인해 주세요." },
  INVALID_CREDENTIALS: {
    status: 401,
    message: "이메일 또는 비밀번호를 확인해 주세요.",
  },
  BAD_REQUEST: { status: 400, message: "요청 형식이 올바르지 않습니다." },
  UNAUTHORIZED: { status: 401, message: "로그인이 필요합니다." },
  FORBIDDEN: { status: 403, message: "요청 권한을 확인해 주세요." },
  NOT_FOUND: { status: 404, message: "요청한 자료를 찾을 수 없습니다." },
  CONFLICT: { status: 409, message: "요청을 현재 상태에 적용할 수 없습니다." },
  PAYLOAD_TOO_LARGE: { status: 413, message: "요청 크기가 너무 큽니다." },
  TOO_MANY_REQUESTS: {
    status: 429,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: "서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  },
};
const errorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    code: z.string().max(64),
    message: z.string().max(300),
    requestId: z.uuid(),
    fieldErrors: z.array(fieldErrorSchema).max(50).optional(),
  })
  .strict();

export function safeErrorMessage(error: unknown) {
  return error instanceof ApiError &&
    messages[error.code]?.status === error.status
    ? messages[error.code].message
    : "저장하지 못했습니다. 연결과 권한을 확인하고 다시 시도해 주세요.";
}

export function parseApiError(
  body: unknown,
  status: number,
  requestId?: string,
) {
  const result = errorSchema.safeParse(body);
  const headerId = z.uuid().safeParse(requestId);
  const fallback = () =>
    new ApiError(
      "요청을 처리하지 못했습니다.",
      status,
      "HTTP_ERROR",
      headerId.success ? headerId.data : undefined,
    );
  if (!result.success || result.data.statusCode !== status) return fallback();
  const data = result.data;
  const known = messages[data.code];
  if (
    !known ||
    known.status !== status ||
    (data.fieldErrors && data.code !== "VALIDATION_FAILED")
  )
    return fallback();
  // The wire message is checked for shape but never displayed. Only local,
  // code-owned copy and validated field codes reach the UI.
  return new ApiError(
    known.message,
    status,
    data.code,
    data.requestId,
    data.fieldErrors,
  );
}
