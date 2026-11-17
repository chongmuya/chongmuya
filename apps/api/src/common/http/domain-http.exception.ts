import { HttpException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

const domainErrors = {
  PASSWORD_RESET_INVALID: {
    status: 400,
    message:
      "유효하지 않거나 만료된 재설정 링크입니다. 메일을 다시 요청해 주세요.",
  },
  KAKAO_UNAVAILABLE: {
    status: 503,
    message: "카카오 인증을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  },
  KAKAO_CONFIGURATION: {
    status: 503,
    message:
      "카카오 로그인 설정 확인이 필요합니다. 기존 로그인 방법을 이용해 주세요.",
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
    message:
      "이미 가입한 이메일입니다. 가입할 때 사용한 로그인 방법을 이용해 주세요.",
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
} as const;

export type FieldError = {
  field: string;
  code:
    | "INVALID_TYPE"
    | "INVALID_LENGTH"
    | "INVALID_EMAIL"
    | "INVALID_UUID"
    | "INVALID_FORMAT"
    | "INVALID_VALUE";
};

// Only code-owned messages may cross the HTTP boundary. Never accept a message
// or validator's original constraints/target/value as an exception argument.
export class DomainHttpException extends HttpException {
  constructor(
    readonly code: keyof typeof domainErrors,
    readonly fieldErrors?: FieldError[],
  ) {
    super(domainErrors[code].message, domainErrors[code].status);
  }
  get safeMessage() {
    return domainErrors[this.code].message;
  }
}

const validationCodes: Record<string, FieldError["code"]> = {
  isString: "INVALID_TYPE",
  isLength: "INVALID_LENGTH",
  minLength: "INVALID_LENGTH",
  maxLength: "INVALID_LENGTH",
  isEmail: "INVALID_EMAIL",
  isUuid: "INVALID_UUID",
  isIso8601: "INVALID_FORMAT",
  matches: "INVALID_FORMAT",
  isInt: "INVALID_VALUE",
  min: "INVALID_VALUE",
  max: "INVALID_VALUE",
};

export function validationException(errors: ValidationError[]) {
  const fields: FieldError[] = [];
  function collect(items: ValidationError[], parent = "") {
    for (const error of items) {
      // Unknown input keys are user input too: do not echo them, even as paths.
      if (
        error.constraints?.whitelistValidation ||
        !/^[a-zA-Z][\w]*$/.test(error.property)
      )
        continue;
      const field = parent ? `${parent}.${error.property}` : error.property;
      if (
        field.length > 100 ||
        field
          .split(".")
          .some((part) =>
            ["__proto__", "constructor", "prototype"].includes(part),
          )
      )
        continue;
      const code = Object.keys(error.constraints ?? {})
        .map((key) => validationCodes[key])
        .find(Boolean);
      if (code && fields.length < 50) fields.push({ field, code });
      if (error.children?.length) collect(error.children, field);
    }
  }
  collect(errors);
  return new DomainHttpException(
    "VALIDATION_FAILED",
    fields.length ? fields : undefined,
  );
}
