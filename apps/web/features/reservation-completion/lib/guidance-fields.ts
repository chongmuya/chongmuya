import type { Completion } from "../types/completion.types";
import type { Field } from "../types/command-field";
import { isoDate, localDate } from "./command-values";
export const guidanceFields = (q: Completion): Field[] => [
  {
    name: "kind",
    label: "예약금",
    value: q.guidance.kind === "UNKNOWN" ? "" : q.guidance.kind,
    options: [
      { value: "NONE", label: "필요 없음" },
      { value: "REQUIRED", label: "필요함" },
    ],
  },
  {
    name: "amount",
    label: "예약금 (원, 불필요하면 0)",
    type: "number",
    value: String(q.guidance.amount ?? 0),
  },
  {
    name: "deadline",
    label: "입금 기한 (예약금 있을 때 필수)",
    type: "datetime-local",
    value: localDate(q.guidance.deadline),
    optional: true,
  },
  {
    name: "channel",
    label: "계좌 안내 방식",
    value: q.guidance.channel === "PENDING" ? "SMS" : q.guidance.channel,
    options: [
      { value: "SMS", label: "문자로만 안내" },
      { value: "WEB", label: "이 예약의 총무 화면에 표시" },
    ],
  },
  {
    name: "bank",
    label: "은행 (예약금 있을 때 필수)",
    value: q.guidance.bank,
    optional: true,
    max: 80,
  },
  {
    name: "account",
    label: "계좌번호 (예약금 있을 때 필수)",
    value: q.guidance.account,
    optional: true,
    max: 100,
  },
  {
    name: "holder",
    label: "예금주 (예약금 있을 때 필수)",
    value: q.guidance.holder,
    optional: true,
    max: 80,
  },
  {
    name: "policy",
    label: "변경·취소·환불 안내",
    type: "textarea",
    value: q.guidance.policy,
    max: 1500,
  },
  {
    name: "webConsent",
    label: "화면 표시 선택 시 계좌 공개에 동의해요",
    type: "checkbox",
    optional: true,
  },
];
export const buildGuidance = (v: Record<string, string>) => ({
  kind: v.kind,
  amount: Number(v.amount),
  deadline: v.deadline ? isoDate(v.deadline) : null,
  channel: v.channel,
  bank: v.bank,
  account: v.account,
  holder: v.holder,
  policy: v.policy,
  webConsent: v.webConsent === "yes",
});
