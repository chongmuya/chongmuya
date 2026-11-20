"use client";
import { useState, type ComponentProps } from "react";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { CommandForm } from "./command-form";
import { isoDate, localDate } from "../lib/command-values";
import { guidanceFields, buildGuidance } from "../lib/guidance-fields";
// Keep a previously opened command mounted while its eligibility changes.
function RetainedCommand({
  available,
  ...props
}: ComponentProps<typeof CommandForm> & { available: boolean }) {
  const [seen, setSeen] = useState(available);
  if (available && !seen) setSeen(true);
  return seen || available ? (
    <CommandForm {...props} available={available} />
  ) : null;
}
export function PaymentForms({
  data: q,
  access,
}: {
  data: Completion;
  access: CompletionAccess;
}) {
  const props = { data: q, access };
  if (access.kind === "organizer")
    return (
      <div className="space-y-5">
        <RetainedCommand
          available={
            !q.cancellation &&
            !!q.order &&
            q.acknowledgedRevision !== q.guidance.revision
          }
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
        <RetainedCommand
          available={
            !q.cancellation && !!q.order && q.guidance.kind === "REQUIRED"
          }
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
      </div>
    );
  return (
    <div className="space-y-5">
      <details className="space-y-4">
        <summary className="cursor-pointer font-semibold">
          예약금·계좌·변경 조건 안내
        </summary>
        <RetainedCommand
          available={!q.cancellation && !q.confirmation}
          {...props}
          action="guidance"
          title="안내 전달"
          description="웹 공개는 동의한 경우만 선택해 주세요. 문자를 선택하면 총무 화면에는 계좌가 표시되지 않아요. 안내 변경은 총무의 재확인이 필요해요."
          fields={guidanceFields}
          build={buildGuidance}
        />
      </details>
      <RetainedCommand
        available={!q.cancellation && q.guidance.kind === "REQUIRED"}
        {...props}
        action="receipt"
        title={q.receipt ? "실입금 기록 정정" : "은행 실입금 확인"}
        description="은행 내역과 입금자를 직접 대조해 주세요. 아래 금액은 이번 추가 입금액이 아니라 이 예약에서 확인한 전체 수령액입니다. 정정 전 기록도 보존돼요."
        fields={(current) => [
          {
            name: "amount",
            label: "실제 수령 총액 (원)",
            type: "number",
            value: String(current.receivedAmount),
          },
          {
            name: "receivedAt",
            label: "실제 입금 시각",
            type: "datetime-local",
            value: localDate(current.receipt?.receivedAt ?? null),
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
      <RetainedCommand
        available={
          !q.cancellation &&
          q.issues.some((i) =>
            [
              "EVENT_STARTED",
              "MENU_LATE",
              "PAYMENT_LATE",
              "TRANSFER_REVIEW",
              "AMOUNT_REVIEW",
            ].includes(i),
          )
        }
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
    </div>
  );
}
