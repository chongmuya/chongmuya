import type { Completion } from "../types/completion.types";
import type { Field } from "../types/command-field";
import { isoDate, localDate } from "./command-values";
const requiresDeposit = (values: Partial<Record<string, string>>) =>
  values.kind === "REQUIRED";

export const guidanceFields = (
  q: Completion,
  useRegisteredAccount = false,
): Field[] => [
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
    label: "예약금 (원)",
    when: requiresDeposit,
    type: "number",
    minValue: 1,
    value: q.guidance.amount ? String(q.guidance.amount) : "",
  },
  {
    name: "deadline",
    label: "입금 기한",
    when: requiresDeposit,
    type: "datetime-local",
    value: localDate(q.guidance.deadline),
  },
  {
    name: "channel",
    label: "계좌 안내 방식",
    when: requiresDeposit,
    value: q.guidance.channel === "PENDING" ? "SMS" : q.guidance.channel,
    options: [
      { value: "SMS", label: "문자로만 안내" },
      { value: "WEB", label: "이 예약의 총무 화면에 표시" },
    ],
  },
  ...(!useRegisteredAccount
    ? [
        {
          name: "bank",
          label: "은행",
          when: requiresDeposit,
          value: q.guidance.bank,
          max: 80,
        },
        {
          name: "account",
          label: "계좌번호",
          when: requiresDeposit,
          value: q.guidance.account,
          max: 100,
        },
        {
          name: "holder",
          label: "예금주",
          when: requiresDeposit,
          value: q.guidance.holder,
          max: 80,
        },
      ]
    : []),
  {
    name: "policy",
    label: "변경·취소·환불 안내",
    type: "textarea",
    value: q.guidance.policy,
    max: 1500,
  },
  {
    name: "webConsent",
    label: "이 예약의 총무에게 계좌를 공개하는 데 동의해요",
    when: (v) => requiresDeposit(v) && v.channel === "WEB",
    type: "checkbox",
  },
];
export const buildGuidance = (
  v: Record<string, string>,
  depositAccountRevision?: number,
) => ({
  kind: v.kind,
  amount: v.kind === "REQUIRED" ? Number(v.amount) : 0,
  deadline: v.kind === "REQUIRED" && v.deadline ? isoDate(v.deadline) : null,
  channel: v.kind === "REQUIRED" ? v.channel : "SMS",
  bank: v.kind === "REQUIRED" ? (v.bank ?? "") : "",
  account: v.kind === "REQUIRED" ? (v.account ?? "") : "",
  holder: v.kind === "REQUIRED" ? (v.holder ?? "") : "",
  policy: v.policy,
  webConsent:
    v.kind === "REQUIRED" && v.channel === "WEB" && v.webConsent === "yes",
  ...(v.kind === "REQUIRED" &&
    depositAccountRevision !== undefined && { depositAccountRevision }),
});
