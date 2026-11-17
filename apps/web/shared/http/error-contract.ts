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
  PASSWORD_RESET_INVALID: {
    status: 400,
    message:
      "유효하지 않거나 만료된 재설정 링크입니다. 메일을 다시 요청해 주세요.",
  },
  KAKAO_UNAVAILABLE: {
    status: 503,
    message: "카카오 인증을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  },
  KAKAO_INVALID: {
    status: 400,
    message: "카카오 인증을 확인할 수 없습니다. 처음부터 다시 진행해 주세요.",
  },
  KAKAO_EXPIRED: {
    status: 400,
    message: "카카오 인증 시간이 만료되었습니다. 다시 시작해 주세요.",
  },
  KAKAO_CANCELLED: {
    status: 400,
    message: "카카오 인증을 취소했어요. 다시 시작할 수 있습니다.",
  },
  KAKAO_CONTEXT_CHANGED: {
    status: 409,
    message:
      "로그인 상태가 바뀌었습니다. 현재 계정을 확인하고 다시 시작해 주세요.",
  },
  KAKAO_LINK_REQUIRED: {
    status: 409,
    message: "기존 계정으로 로그인한 뒤 마이페이지에서 카카오를 연결해 주세요.",
  },
  KAKAO_ALREADY_LINKED: {
    status: 409,
    message: "이미 연결된 카카오 계정입니다. 기존 연결을 교체할 수 없습니다.",
  },
  REAUTHENTICATION_REQUIRED: {
    status: 403,
    message: "현재 계정의 비밀번호를 다시 확인하고 연결에 동의해 주세요.",
  },

  EMAIL_VERIFICATION_REQUIRED: {
    status: 400,
    message: "현재 이메일의 인증을 완료해 주세요.",
  },
  EMAIL_VERIFICATION_INVALID: {
    status: 400,
    message: "유효하지 않은 이메일 인증 요청입니다. 다시 인증해 주세요.",
  },
  EMAIL_VERIFICATION_EXPIRED: {
    status: 400,
    message: "이메일 인증 시간이 만료되었습니다. 다시 요청해 주세요.",
  },
  EMAIL_VERIFICATION_MISMATCH: {
    status: 400,
    message: "인증번호가 일치하지 않아요.",
  },
  EMAIL_VERIFICATION_LIMIT: {
    status: 429,
    message: "인증번호 입력 횟수를 초과했습니다. 다시 요청해 주세요.",
  },
  EMAIL_VERIFICATION_WAIT: {
    status: 429,
    message: "재전송 대기 시간이 지난 뒤 다시 요청해 주세요.",
  },
  EMAIL_VERIFICATION_UNAVAILABLE: {
    status: 503,
    message: "이메일 발송에 실패했어요. 잠시 후 다시 요청해 주세요.",
  },
  FIRST_SETUP_CONFLICT: {
    status: 409,
    message: "이미 저장된 이용 유형이나 닉네임을 변경할 수 없습니다.",
  },
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
