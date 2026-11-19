import type { Completion, CompletionAccess } from "../types/completion.types";
import { CommandForm, isoDate, localDate, type Field } from "./command-form";
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
export function PaymentForms({
  data: q,
  access,
}: {
  data: Completion;
  access: CompletionAccess;
}) {
  const props = { data: q, access };
  if (q.cancellation) return null;
  if (access.kind === "organizer")
    return (
      <div className="space-y-5">
        {q.order && q.acknowledgedRevision !== q.guidance.revision && (
          <CommandForm
            {...props}
            action="acknowledge"
            title="새 안내 확인"
            fields={[
              {
                name: "confirmed",
                label: "최신 금액·기한·계좌 안내·변경 조건을 확인했어요",
                type: "checkbox",
              },
            ]}
            build={(_, b) => ({
              guidanceRevision: b.guidance.revision,
              confirmed: true,
            })}
          />
        )}
        {q.order && q.guidance.kind === "REQUIRED" && (
          <CommandForm
            {...props}
            action="transfer"
            title="송금 사실 신고"
            description="신고만으로 예약이 확정되지 않아요. 실제 은행 입금은 사장님이 확인해요."
            fields={[
              { name: "payer", label: "입금자명", max: 80 },
              { name: "amount", label: "송금 신고 금액 (원)", type: "number" },
            ]}
            build={(v, b) => ({
              guidanceRevision: b.guidance.revision,
              payer: v.payer,
              amount: Number(v.amount),
            })}
          />
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      {!q.confirmation && (
        <details className="space-y-4">
          <summary className="cursor-pointer font-semibold">
            예약금·계좌·변경 조건 안내
          </summary>
          <CommandForm
            {...props}
            action="guidance"
            title="안내 전달"
            description="웹 공개는 동의한 경우만 선택해 주세요. 문자를 선택하면 총무 화면에는 계좌가 표시되지 않아요. 안내 변경은 총무의 재확인이 필요해요."
            fields={guidanceFields(q)}
            build={buildGuidance}
          />
        </details>
      )}
      {q.guidance.kind === "REQUIRED" && (
        <CommandForm
          {...props}
          action="receipt"
          title={q.receipt ? "실입금 기록 정정" : "은행 실입금 확인"}
          description="은행 내역과 입금자를 직접 대조해 주세요. 아래 금액은 이번 추가 입금액이 아니라 이 예약에서 확인한 전체 수령액입니다. 정정 전 기록도 보존돼요."
          fields={[
            {
              name: "amount",
              label: "실제 수령 총액 (원)",
              type: "number",
              value: String(q.receivedAmount),
            },
            {
              name: "receivedAt",
              label: "실제 입금 시각",
              type: "datetime-local",
              value: localDate(q.receipt?.receivedAt ?? null),
            },
            {
              name: "reason",
              label: "확인·정정 사유",
              type: "textarea",
              max: 500,
            },
            {
              name: "checked",
              label: "은행 내역을 확인했고 실제 수령 총액이 맞아요",
              type: "checkbox",
            },
          ]}
          build={(v, b) => ({
            amount: Number(v.amount),
            receivedAt: isoDate(v.receivedAt),
            guidanceRevision: b.guidance.revision,
            corrects: b.receipt?.id ?? null,
            reason: v.reason,
          })}
        />
      )}
      {q.issues.some((i) =>
        [
          "MENU_LATE",
          "PAYMENT_LATE",
          "TRANSFER_REVIEW",
          "AMOUNT_REVIEW",
        ].includes(i),
      ) && (
        <CommandForm
          {...props}
          action="resolve"
          title="예외 확인 · 진행 재개"
          description="지연·신고 금액 불일치·초과 입금 내역을 총무와 확인한 뒤 기록해 주세요. 필수 메뉴와 부족한 실제 입금을 대신하지 않아요."
          fields={[
            {
              name: "reason",
              label: "확인 내용과 진행 재개 사유",
              type: "textarea",
              max: 500,
            },
          ]}
          build={(v) => ({ reason: v.reason })}
        />
      )}
    </div>
  );
}
