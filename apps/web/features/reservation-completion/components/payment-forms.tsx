"use client";
import { useState, type ComponentProps } from "react";
import Link from "next/link";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { CommandForm } from "./command-form";
import { isoDate, localDate } from "../lib/command-values";
import { won } from "../lib/agreement-labels";
import { guidanceFields, buildGuidance } from "../lib/guidance-fields";
import { depositGuidanceReady } from "../lib/deposit-guidance";
const exceptionLabels = new Map([
  ["EVENT_STARTED", "예약 시간이 지났어요."],
  ["MENU_LATE", "메뉴 전달 기한을 확인해 주세요."],
  ["PAYMENT_LATE", "입금 기한이 지났어요."],
  ["TRANSFER_REVIEW", "총무의 송금 신고를 입금 안내와 대조해 주세요."],
  ["AMOUNT_REVIEW", "실제 수령액과 안내한 예약금이 달라요."],
]);

// Keep a previously opened command mounted while its eligibility changes.
function RetainedCommand({
  available,
  disclosure,
  openInitially = false,
  ...props
}: ComponentProps<typeof CommandForm> & {
  available: boolean;
  disclosure?: string;
  openInitially?: boolean;
}) {
  const [seen, setSeen] = useState(available);
  const [initialOpen, setInitialOpen] = useState(openInitially);
  if (available && !seen) {
    setSeen(true);
    setInitialOpen(openInitially);
  }
  if (!seen && !available) return null;
  const form = <CommandForm {...props} available={available} />;
  return disclosure ? (
    <details className="space-y-4" open={initialOpen || undefined}>
      <summary className="cursor-pointer font-semibold">{disclosure}</summary>
      {form}
    </details>
  ) : (
    form
  );
}
export function PaymentForms({
  data: q,
  access,
}: {
  data: Completion;
  access: CompletionAccess;
}) {
  const props = { data: q, access };
  const ready = depositGuidanceReady(q);
  if (access.kind === "organizer") return <OrganizerPayment {...props} />;
  const exceptions = q.issues.filter((issue) => exceptionLabels.has(issue));
  return (
    <div className="space-y-5">
      {!q.cancellation &&
        (exceptions.length > 0 || q.issues.includes("RECEIPT_REVIEW")) && (
          <ul className="space-y-1 rounded-control bg-soft p-3 text-sm">
            {exceptions.map((issue) => (
              <li key={issue}>{exceptionLabels.get(issue)}</li>
            ))}
            {q.issues.includes("RECEIPT_REVIEW") && (
              <li>
                예약금 안내가 바뀌었어요. 최신 안내에 맞춰 수령 내역을 확인해
                주세요.
              </li>
            )}
          </ul>
        )}
      <RetainedCommand
        disclosure={q.receipt ? "입금 기록 정정" : "수령 내역 입력"}
        openInitially={
          ready &&
          (!q.receipt ||
            q.issues.includes("RECEIPT_REVIEW") ||
            q.issues.includes("DEPOSIT_UNCONFIRMED"))
        }
        available={!q.cancellation && q.guidance.kind === "REQUIRED"}
        {...props}
        action="receipt"
        title={q.receipt ? "입금 기록 정정 저장" : "실입금 기록하기"}
        hideTitle
        description={
          q.transfer
            ? `총무 송금 신고 · ${q.transfer.payer} · ${won(q.transfer.amount)}. 은행 내역과 대조해 주세요.`
            : `예약금 ${won(q.guidance.amount)} · 은행에서 확인한 전체 수령액을 입력해 주세요.`
        }
        fields={(current) => [
          {
            name: "amount",
            label: "실제 수령 총액 (원)",
            type: "number",
            value: current.receipt ? String(current.receivedAmount) : "",
          },
          {
            name: "receivedAt",
            label: "실제 입금 시각",
            type: "datetime-local",
            value: localDate(current.receipt?.receivedAt ?? null),
          },
          {
            name: "reason",
            label: "정정 사유",
            when: () => !!current.receipt,
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
          reason: b.receipt ? v.reason : "은행 입금 확인",
        })}
      />
      <RetainedCommand
        available={!q.cancellation && exceptions.length > 0}
        {...props}
        action="resolve"
        title="확인 내용을 기록하고 진행하기"
        description="기한이나 금액이 달라진 이유를 총무와 확인해 주세요."
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
      <RetainedCommand
        disclosure={ready ? "예약금 안내 편집" : "입금 조건 입력"}
        available={
          !q.cancellation && !q.confirmation && q.guidance.kind !== "NONE"
        }
        openInitially={!ready}
        {...props}
        action="guidance"
        title="예약금 안내 보내기"
        hideTitle
        description="총무에게 입금 조건과 변경·취소·환불 안내를 보내요."
        fields={(base) =>
          guidanceFields(
            base,
            !base.guidance.account && !!base.ownerDepositAccount,
          )
        }
        build={(values, base) =>
          buildGuidance(
            values,
            base.guidance.account
              ? undefined
              : base.ownerDepositAccount?.revision,
          )
        }
        preview={(values, base) =>
          values.kind === "REQUIRED" &&
          access.kind === "owner" &&
          !base.guidance.account ? (
            <div className="space-y-2">
              {base.ownerDepositAccount && (
                <p className="rounded-control bg-soft p-3 text-sm">
                  연결된 계좌 · {base.ownerDepositAccount.bank} · 끝자리{" "}
                  {base.ownerDepositAccount.lastDigits}
                </p>
              )}
              <Link
                href="/mypage?view=account#reservation-deposit-account"
                className="text-sm font-medium text-link underline"
              >
                {base.ownerDepositAccount
                  ? "연결된 계좌 관리"
                  : "계정에 예약금 계좌 등록하기"}
              </Link>
            </div>
          ) : null
        }
      />
    </div>
  );
}

function OrganizerPayment({
  data,
  access,
}: {
  data: Completion;
  access: CompletionAccess;
}) {
  const [editing, setEditing] = useState(false);
  const { guidance, transfer, receipt, receivedAmount, refundedAmount } = data;
  const canAct =
    !data.cancellation && !!data.order && depositGuidanceReady(data);
  const needsReview = canAct && data.issues.includes("GUIDANCE_REVIEW");
  const confirmed = data.progress === "CONFIRMED";
  const receiptComplete =
    guidance.kind === "REQUIRED" &&
    receipt?.guidanceRevision === guidance.revision &&
    receivedAmount - refundedAmount >= (guidance.amount ?? Infinity);
  const transferRecorded = transfer?.guidanceRevision === guidance.revision;
  const canReport =
    canAct &&
    !needsReview &&
    !confirmed &&
    guidance.kind === "REQUIRED" &&
    (!receiptComplete || data.issues.includes("TRANSFER_REVIEW"));
  const status = data.cancellation
    ? "예약이 취소됐어요."
    : confirmed
      ? "예약이 확정됐어요."
      : receiptComplete
        ? "매장이 입금을 확인했어요."
        : transferRecorded && !needsReview
          ? "매장의 입금 확인을 기다리고 있어요."
          : null;
  const props = { data, access };
  return (
    <div className="space-y-4">
      {status && (
        <p role="status" className="text-sm font-medium text-brand-ink">
          {status}
        </p>
      )}
      <RetainedCommand
        {...props}
        available={needsReview}
        action="acknowledge"
        title="안내를 확인했어요"
        hideTitle
        fields={[]}
        build={(_, base) => ({
          guidanceRevision: base.guidance.revision,
          confirmed: true,
        })}
      />
      {canReport && transferRecorded && !editing && (
        <button
          type="button"
          className="min-h-11 text-sm text-link underline"
          onClick={() => setEditing(true)}
        >
          송금 정보 수정
        </button>
      )}
      <RetainedCommand
        {...props}
        available={canReport && (!transferRecorded || editing)}
        action="transfer"
        title={transferRecorded ? "송금 정보 저장" : "송금했어요"}
        hideTitle
        fields={(base) => [
          {
            name: "payer",
            label: "입금자명",
            max: 80,
            value: base.transfer?.payer,
          },
          {
            name: "amount",
            label: "보낸 금액 (원)",
            type: "number",
            minValue: 1,
            value: base.transfer ? String(base.transfer.amount) : undefined,
          },
        ]}
        build={(values, base) => ({
          guidanceRevision: base.guidance.revision,
          payer: values.payer,
          amount: Number(values.amount),
        })}
        onDone={() => setEditing(false)}
      />
    </div>
  );
}
