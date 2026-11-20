import type { Audit } from "../types/completion.types";
const roles: Record<string, string> = {
  ORGANIZER: "총무",
  OWNER: "매장 담당자",
  LINK: "매장 담당자 (예약 관리 링크)",
  OPERATOR_RECORDED: "운영 담당자",
  SYSTEM: "자동 확인",
};
export function auditLabel(audit: Audit) {
  const role = roles[audit.kind] ?? "예약 담당자";
  const method =
    (
      { WEB: "화면 확인", PHONE: "전화 확인", SMS: "문자 확인" } as Record<
        string,
        string
      >
    )[audit.method] ?? "직접 확인";
  return `${role} · ${method}`;
}
