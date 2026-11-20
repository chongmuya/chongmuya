import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import type { Completion } from "../types/completion.types";
import { won } from "../lib/agreement-labels";
import { progressLabels } from "../lib/progress-labels";
export { won } from "../lib/agreement-labels";

function summaryDate(value: string, year = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미확인";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${year ? `${parts.year}.` : ""}${parts.month}.${parts.day}${year ? "." : `(${parts.weekday})`} ${parts.hour}:${parts.minute}`;
}

export function CompletionSummary({
  data: q,
  organizer,
  compact = false,
  footer,
}: {
  data: Completion;
  organizer: boolean;
  compact?: boolean;
  footer?: ReactNode;
}) {
  if (compact)
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold">
          {q.cancellation
            ? progressLabels.CANCELLED
            : (progressLabels[q.progress] ?? "메뉴·송금 안내")}
        </h2>
        {q.progress === "GUIDANCE_PENDING" && (
          <p className="text-sm text-secondary">
            예약금 안내를 준비하고 있어요. 메뉴는 임시 저장할 수 있어요.
          </p>
        )}
      </div>
    );
  return (
    <section className="space-y-8 rounded-control bg-surface px-[29px] pt-10 pb-7 shadow-card max-[360px]:px-5">
      <div className="flex flex-col items-center gap-6 text-center">
        <ReservationResultIcon />
        <div className="space-y-4">
          <h2 className="text-2xl leading-[normal] font-bold text-black">
            {q.cancellation
              ? progressLabels.CANCELLED
              : (progressLabels[q.progress] ?? "예약 진행 확인")}
          </h2>
          <p className="mx-auto max-w-[162px] text-xs leading-[normal]">
            {q.progress === "CONFIRMED"
              ? "필요한 메뉴·입금 확인이 완료됐어요. 이제 참석 명단을 준비해볼까요?"
              : q.cancellation
                ? "취소 내역을 확인해 주세요."
                : "매장에서 예약 내용을 확인하고 있어요."}
          </p>
          {organizer && q.progress === "CONFIRMED" && (
            <AttendanceLink eventId={q.eventId} />
          )}
        </div>
      </div>
      {footer}
    </section>
  );
}
export function ReservationResultIcon({
  unavailable = false,
}: {
  unavailable?: boolean;
}) {
  return (
    <div className="mx-auto grid size-[85px] shrink-0 place-items-center rounded-full bg-[radial-gradient(ellipse_at_96%_78%,#ffdd99_0%,#fcbe7b_21%,#f99f5e_42%,#f78141_63%,#f46224_84%)]">
      <Image
        src={
          unavailable
            ? "/images/reservations/change-unavailable.svg"
            : "/images/reservations/change-calendar.svg"
        }
        width={47.5023}
        height={48.7387}
        alt=""
      />
    </div>
  );
}
export function AttendanceLink({ eventId }: { eventId: string }) {
  return (
    <Link
      href={`/events?event=${eventId}&view=attendance`}
      className="inline-flex min-h-11 items-center gap-5 rounded-control bg-brand px-[14px] py-4 text-xs leading-[normal] text-copy"
    >
      참석 관리하러 가기
      <span className="relative h-2.5 w-3">
        <Image
          src="/images/reservations/attendance-next.svg"
          width={13.7105}
          height={10.937}
          alt=""
          className="absolute -top-[0.4685px] -left-[0.75px] max-w-none rotate-180"
        />
      </span>
    </Link>
  );
}
export function CompletionFacts({ data: q }: { data: Completion }) {
  const latest = q.changes[0];
  const applied =
    latest?.kind === "CHANGE" && latest.status === "APPLIED"
      ? q.history?.findIndex((entry) => entry.action === "CHANGE_APPLIED")
      : undefined;
  const previousDate =
    applied != null && applied >= 0
      ? q.history[applied + 1]?.agreement.startsAt
      : undefined;
  const rows = [
    {
      icon: "summary-location",
      width: 18,
      height: 18,
      value: q.restaurantName,
      label: "메뉴",
      detail:
        q.order?.lines.map((l) => `${l.name} ${l.quantity}개`).join(", ") ||
        "미제출",
    },
    {
      icon: "summary-guests",
      width: 16.848,
      height: 14.8528,
      value: `${q.agreement.expectedGuests}명`,
      label: "예약금",
      detail: q.guidance.kind === "NONE" ? "없음" : won(q.guidance.amount),
    },
    {
      icon: "summary-date",
      width: 18,
      height: 18,
      value: summaryDate(q.agreement.startsAt),
      label: q.cancellation ? "실제 반환" : "확정 시각",
      detail: q.cancellation
        ? q.refundedAmount > 0
          ? won(q.refundedAmount)
          : !q.receipt && !q.transfer
            ? "예약금 없음"
            : "반환 기록 없음"
        : q.confirmation
          ? summaryDate(q.confirmation.at, true)
          : "확인 중",
    },
  ];
  return (
    <dl className="space-y-4 text-xs leading-[normal]">
      {rows.map((row) => (
        <div
          key={row.icon}
          className="grid grid-cols-[minmax(0,113fr)_minmax(0,155fr)] items-center gap-x-9 max-[360px]:grid-cols-1 max-[360px]:gap-y-2"
        >
          <dt className="flex min-w-0 items-center gap-3">
            <span className="flex size-[18px] shrink-0 items-center justify-center">
              <Image
                src={`/images/reservations/${row.icon}.svg`}
                width={row.width}
                height={row.height}
                alt=""
              />
            </span>
            <span className="wrap-anywhere">
              {row.icon === "summary-date" &&
              previousDate &&
              previousDate !== q.agreement.startsAt ? (
                <>
                  <del className="block">{summaryDate(previousDate)}</del>
                  <span className="mt-1 block text-brand min-[360px]:min-w-[94px]">
                    →{row.value}
                  </span>
                </>
              ) : (
                row.value
              )}
            </span>
          </dt>
          <dd className="grid grid-cols-[45px_minmax(0,1fr)] gap-3">
            <span className="text-placeholder">{row.label}</span>
            <span className="wrap-anywhere">{row.detail}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function OrderSummary({ data: q }: { data: Completion }) {
  if (!q.order) return null;
  return (
    <section className="space-y-3 rounded-[16px] bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold text-secondary">주문 메뉴</h3>
      <ul className="space-y-3">
        {q.order.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-2 text-sm">
            <span className="min-w-0 wrap-anywhere">
              {l.name} ×{l.quantity}
            </span>
            <span className="shrink-0 text-muted">{won(l.subtotal)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between gap-3 border-t border-border pt-3 font-semibold">
        <span>메뉴 주문 금액</span>
        <span className="text-brand">{won(q.order.total)}</span>
      </p>
    </section>
  );
}
export function DepositSummary({ data: q }: { data: Completion }) {
  const rows: [string, string][] = [
    ["금액", q.guidance.kind === "NONE" ? "없음" : won(q.guidance.amount)],
    ["입금자", q.transfer?.payer || "미확인"],
    [
      "상태",
      q.cancellation
        ? progressLabels.CANCELLED
        : q.receipt
          ? `실제 수령 ${won(q.receivedAmount)}`
          : q.transfer
            ? "총무가 입금했다고 알림"
            : q.guidance.kind === "NONE"
              ? "예약금 없음"
              : "실제 입금 확인 전",
    ],
  ];
  if (q.guidance.deadline)
    rows.push(["입금 기한", koreanDateLabel(q.guidance.deadline)]);
  if (q.cancellation && (q.receipt || q.transfer || q.refundedAmount > 0))
    rows.push([
      "실제 반환",
      q.refundedAmount > 0 ? won(q.refundedAmount) : "반환 기록 없음",
    ]);
  return (
    <section className="space-y-3 rounded-[16px] bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold text-secondary">예약금</h3>
      <dl className="space-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[72px_minmax(0,1fr)] gap-3"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function GuidanceSummary({ data: q }: { data: Completion }) {
  const g = q.guidance;
  const [copy, setCopy] = useState("");
  return (
    <section className="space-y-4 rounded-card bg-surface p-5 shadow-card">
      <h3 className="font-semibold">예약금 안내 · {g.revision}차</h3>
      <p>
        {g.kind === "NONE"
          ? "예약금 없음이 확인됐어요."
          : g.kind === "UNKNOWN"
            ? "예약금 여부·금액 확인 중"
            : `예약금 ${won(g.amount)}`}
      </p>
      {g.deadline && (
        <p className="text-sm">입금 기한 {koreanDateLabel(g.deadline)}</p>
      )}
      {g.channel === "WEB" && g.account ? (
        <div className="rounded-control bg-brand p-5 text-copy">
          <p className="text-xl font-bold break-all">{g.account}</p>
          <p className="my-2 text-sm">
            {g.bank} · {g.holder}
          </p>
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${g.bank} ${g.account} ${g.holder}`)
                .then(() => setCopy("계좌를 복사했어요."))
                .catch(() =>
                  setCopy(
                    "복사하지 못했어요. 계좌를 직접 선택해 복사해 주세요.",
                  ),
                );
            }}
          >
            계좌 복사
          </button>
          <p role="status" className="text-xs">
            {copy}
          </p>
        </div>
      ) : (
        g.kind !== "NONE" && (
          <p className="text-sm text-muted">
            {g.channel === "SMS"
              ? "계좌는 문자로만 안내해요. 문자를 받지 못했다면 매장에 안내 상태를 확인해 주세요."
              : "사장님이 확인 후 예약금 정보를 안내해 드려요."}
          </p>
        )
      )}
      <p className="whitespace-pre-wrap text-sm">
        변경·취소·환불 조건: {g.policy}
      </p>
      <p className="text-xs text-muted">
        {g.audit
          ? `${g.audit.confirmer} · ${koreanDateLabel(g.issuedAt)}`
          : "선택 당시 제안 기준"}
      </p>
    </section>
  );
}
