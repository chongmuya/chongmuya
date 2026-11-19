export const messages: Record<
  string,
  {
    status: number;
    message: string;
  }
> = {
  RESERVATION_STATE_CONFLICT: {
    status: 409,
    message:
      "예약 내용이 변경됐어요. 최신 내용과 작성한 입력을 확인한 뒤 다시 적용해 주세요.",
  },
  RESERVATION_MENU_CHANGED: {
    status: 409,
    message:
      "메뉴판이 변경됐거나 가격·판매 상태를 확인해야 해요. 최신 메뉴를 다시 확인해 주세요.",
  },
  RESERVATION_MENU_INVALID: {
    status: 409,
    message: "한 품목 이상 선택하고 최소 주문 금액·수량을 확인해 주세요.",
  },
  RESERVATION_GUIDANCE_PENDING: {
    status: 409,
    message: "예약금 안내와 현재 조건을 확인한 뒤 제출해 주세요.",
  },
  RESERVATION_ACTION_BLOCKED: {
    status: 409,
    message:
      "현재 예약 상태에서는 처리할 수 없어요. 미처리 요청과 확인 내용을 확인해 주세요.",
  },
  RESERVATION_ACCESS_INVALID: {
    status: 403,
    message:
      "예약 관리 권한이 만료되거나 폐기됐어요. 새 예약 관리 문자 링크를 열어 주세요.",
  },

  RESERVATION_SELECTION_CONFLICT: {
    status: 409,
    message:
      "문의 또는 제안이 바뀌었어요. 현재 선택 결과와 최신 답변을 확인해 주세요.",
  },
  RESERVATION_PROPOSAL_UNAVAILABLE: {
    status: 409,
    message:
      "종료되었거나 선택 기한이 지난 제안이에요. 최신 상태를 확인해 주세요.",
  },
  RESERVATION_REINQUIRY_BLOCKED: {
    status: 409,
    message:
      "무응답 후보·유효한 제안 또는 선택한 매장이 있어요. 현재 회차를 확인해 주세요.",
  },
  EVENT_SCHEDULE_CONFIRMATION: {
    status: 409,
    message:
      "새 문의 일정으로 행사 날짜도 갱신하는 데 동의해 주세요. 이전 문의 일정은 보존됩니다.",
  },
  EVENT_CREATION_CONFLICT: {
    status: 409,
    message:
      "이미 저장된 행사 요청과 내용이 달라요. 내 행사에서 생성 결과를 확인해 주세요.",
  },
  EVENT_SCHEDULE_LOCKED: {
    status: 409,
    message:
      "발송한 문의 또는 선택한 매장의 일정이 있어요. 모두 종료된 문의는 재문의에서 날짜를 바꿀 수 있어요. 선택한 예약의 일정 변경은 아직 지원하지 않아요.",
  },

  OWNER_REQUIRED: { status: 403, message: "사장님 계정으로 이용해 주세요." },
  RESTAURANT_DUPLICATE: {
    status: 409,
    message: "이미 등록된 매장이 있어요. 관리자에게 문의해 주세요.",
  },
  RESTAURANT_VERSION_CONFLICT: {
    status: 409,
    message:
      "매장 정보가 변경됐어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.",
  },
  ADDRESS_SELECTION_REQUIRED: {
    status: 400,
    message: "주소 검색 결과를 선택해 주세요.",
  },
  GEOCODING_CONFIGURATION: {
    status: 503,
    message:
      "주소 검색 설정을 확인하고 있어요. 입력 내용은 보존되며 다시 검색할 수 있어요.",
  },
  GEOCODING_LIMIT: {
    status: 429,
    message: "주소 검색 요청이 많아요. 잠시 후 다시 검색해 주세요.",
  },
  GEOCODING_UNAVAILABLE: {
    status: 503,
    message:
      "주소 검색에 연결하지 못했어요. 입력 내용을 확인하고 다시 검색해 주세요.",
  },
  MESSAGE_CONFIGURATION: {
    status: 503,
    message: "문자 발송 설정 확인이 필요해요. 저장된 문의는 유지됩니다.",
  },
  MERCHANT_ACCESS_EXPIRED: {
    status: 403,
    message:
      "접근 권한이 만료됐습니다. 문자에 있는 원래 링크를 다시 열어 주세요.",
  },
  MERCHANT_LINK_INVALID: {
    status: 403,
    message: "사용할 수 없거나 만료된 문의 링크입니다. 총무에게 문의해 주세요.",
  },
  MERCHANT_REPLY_CONFLICT: {
    status: 409,
    message: "답변이 변경됐어요. 최신 답변을 확인한 뒤 다시 저장해 주세요.",
  },
  DELIVERY_RETRY_BLOCKED: {
    status: 409,
    message: "접수 여부와 현재 발송 조건을 먼저 확인해야 합니다.",
  },

  ATTENDANCE_CLOSED: {
    status: 409,
    message: "참여자 응답이 마감됐어요. 총무에게 문의해 주세요.",
  },
  ATTENDANCE_ACCESS_INVALID: {
    status: 403,
    message: "참여자 정보를 다시 입력해 내 응답을 열어 주세요.",
  },
  ATTENDANCE_IDENTITY_CHANGED: {
    status: 409,
    message:
      "행사 명단의 식별 정보가 변경됐어요. 이름과 뒤 4자리를 다시 확인해 주세요.",
  },
  ATTENDANCE_MISMATCH: {
    status: 400,
    message: "입력한 이름과 뒤 4자리를 확인해 주세요.",
  },
  ATTENDANCE_CONFLICT: {
    status: 409,
    message:
      "명단이나 응답이 변경됐어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.",
  },
  ATTENDANCE_REVIEW_CONFLICT: {
    status: 409,
    message:
      "접수 또는 대상자의 응답이 변경됐어요. 최신 두 답변을 확인하고 다시 처리해 주세요.",
  },
  ATTENDANCE_PHONE_CONFLICT: {
    status: 409,
    message:
      "대상자에게 다른 뒤 4자리가 있어요. 행사 명단을 먼저 바로잡아 주세요.",
  },
  ATTENDANCE_CHOICE_REQUIRED: {
    status: 400,
    message: "기존 응답 유지 또는 접수된 응답 적용을 선택해 주세요.",
  },
  ROSTER_SAVE_CONFLICT: {
    status: 409,
    message:
      "같은 요청으로 다른 명단을 저장할 수 없어요. 등록 결과를 확인해 주세요.",
  },
  ROSTER_LIMIT: {
    status: 400,
    message:
      "행사 명단은 500명까지 등록할 수 있어요. 필요한 인원만 직접 입력해 주세요. 기존 명단은 유지됩니다.",
  },
  EVENT_GROUP_REQUIRED: {
    status: 400,
    message: "모임에 연결한 행사에서 모임 명단을 가져올 수 있어요.",
  },
  EVENT_REQUEST_EXISTS: {
    status: 409,
    message:
      "이 행사에는 이미 문의가 접수됐어요. 기존 진행 상태를 확인해 주세요.",
  },
  RESERVATION_RETRY_CONFLICT: {
    status: 409,
    message:
      "이미 접수된 요청과 내용이 달라요. 행사에서 접수 결과를 확인해 주세요.",
  },
  RESTAURANT_INQUIRY_UNAVAILABLE: {
    status: 409,
    message:
      "문의할 수 없는 매장이 포함됐어요. 매장 정보를 다시 확인해 주세요.",
  },
  RESERVATION_DATE_INVALID: {
    status: 400,
    message: "예약 문의는 미래 날짜와 시작 시간으로 접수해 주세요.",
  },

  GROUP_REGISTRATION_CONFLICT: {
    status: 409,
    message:
      "이 등록 요청은 이미 저장되었습니다. 내 모임에서 결과를 확인해 주세요.",
  },
  ROSTER_MEMBER_CONFLICT: {
    status: 409,
    message: "기존 구성원 선택을 확인할 수 없어요. 명단을 다시 확인해 주세요.",
  },
  ROSTER_DUPLICATES_UNCONFIRMED: {
    status: 400,
    message:
      "같은 이름의 구성원을 확인해 주세요. 동명이인은 각각 등록할 수 있어요.",
  },
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
