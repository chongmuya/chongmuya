import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { buttonStyles } from "@/shared/ui/button";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import type { Completion } from "../types/completion.types";
export const won = (n: number | null | undefined) =>
  n === null || n === undefined ? "미확인" : `${n.toLocaleString("ko-KR")}원`;
export const progressLabels: Record<string, string> = {
  GUIDANCE_PENDING: "예약금 정보를 준비하고 있어요",
  MENU_REQUIRED: "메뉴를 선택해 전달해 주세요",
  GUIDANCE_REVIEW: "새 예약금 안내를 확인해 주세요",
  PAYMENT_CHECKING: "매장 확인을 기다리고 있어요",
  CHECK_REQUIRED: "매장 확인이 필요해요",
  CONFIRMED: "예약이 확정됐어요",
  REFUND_REVIEW: "예약이 취소됐어요 · 환불 확인 중",
  REFUND_PENDING: "예약이 취소됐어요 · 환불 대기",
  CANCELLED: "예약 취소 처리가 완료됐어요",
};
const issueLabels: Record<string, string> = {
  MENU_LATE: "메뉴 제출 기한 경과",
  PAYMENT_LATE: "입금 기한 경과",
  TRANSFER_REVIEW: "신고 금액·안내 차수 또는 송금 지연 확인 필요",
  AMOUNT_REVIEW: "실제 수령액과 안내 금액 차이 확인 필요",
  RECEIPT_REVIEW: "변경된 안내 기준으로 실제 입금 재확인 필요",
  DEPOSIT_UNCONFIRMED: "실제 수령 금액 확인 필요",
  GUIDANCE_REVIEW: "최신 안내를 총무가 확인해야 해요",
};
export function CompletionSummary({
  data: q,
  organizer,
}: {
  data: Completion;
  organizer: boolean;
}) {
  return (
    <>
      <section className="space-y-6 rounded-card bg-surface p-5 py-8 shadow-card">
        {q.progress === "CONFIRMED" && (
          <Image
            src="/images/ui/success.svg"
            width={48}
            height={48}
            alt=""
            className="mx-auto"
          />
        )}
        <h2 className="text-center text-2xl font-bold">
          {progressLabels[q.progress] ?? "예약 진행 확인"}
        </h2>
        <p className="text-center text-sm">
          {q.progress === "CONFIRMED"
            ? "메뉴 전달과 필요한 실제 입금 확인이 완료됐어요."
            : q.cancellation
              ? "취소와 환불은 별도로 처리돼요. 실제 반환 내역을 확인해 주세요."
              : q.progress === "GUIDANCE_PENDING"
                ? "사장님이 금액·계좌·기한을 확인하고 있어요. 메뉴는 임시 저장할 수 있어요."
                : "총무의 송금 신고는 실제 입금 확인과 달라요. 필요한 조건이 모두 충족되면 예약이 확정돼요."}
        </p>
        {q.progress === "CONFIRMED" && organizer && (
          <Link
            className={buttonStyles({ className: "mx-auto w-fit" })}
            href={`/events?event=${q.eventId}&view=attendance`}
          >
            참석 관리하러 가기
          </Link>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted">매장</dt>
          <dd>{q.restaurantName}</dd>
          <dt className="text-muted">인원</dt>
          <dd>{q.agreement.expectedGuests}명</dd>
          <dt className="text-muted">날짜·시간</dt>
          <dd>{koreanDateLabel(q.agreement.startsAt)}</dd>
          <dt className="text-muted">예약금</dt>
          <dd>
            {q.guidance.kind === "NONE" ? "없음" : won(q.guidance.amount)}
          </dd>
          <dt className="text-muted">실제 수령</dt>
          <dd>{q.receipt ? won(q.receivedAmount) : "확인 기록 없음"}</dd>
          {q.confirmation && (
            <>
              <dt className="text-muted">확정 시각</dt>
              <dd>{koreanDateLabel(q.confirmation.at)}</dd>
              <dt className="text-muted">확인자·방법</dt>
              <dd>
                {q.confirmation.audit.confirmer} · {q.confirmation.audit.method}
              </dd>
            </>
          )}
          {q.cancellation && (
            <>
              <dt className="text-muted">취소 시각</dt>
              <dd>{koreanDateLabel(q.cancellation.at)}</dd>
              <dt className="text-muted">환불 예정</dt>
              <dd>{won(q.refundExpected)}</dd>
              <dt className="text-muted">실제 반환</dt>
              <dd>{won(q.refundedAmount)}</dd>
            </>
          )}
        </dl>
        {q.transfer && (
          <p className="text-sm">
            총무 송금 신고: {q.transfer.payer} · {won(q.transfer.amount)} ·{" "}
            {koreanDateLabel(q.transfer.reportedAt)} (안내{" "}
            {q.transfer.guidanceRevision}차)
          </p>
        )}
        {!!q.issues.filter((i) => issueLabels[i]).length && (
          <ul className="space-y-2 text-sm text-brand-action">
            {q.issues
              .filter((i) => issueLabels[i])
              .map((i) => (
                <li key={i}>{issueLabels[i]}</li>
              ))}
          </ul>
        )}
        {q.issues.some((x) => x.endsWith("LATE")) && (
          <p role="status" className="rounded-control bg-choice p-3 text-sm">
            기한이 지나 매장 확인이 필요해요. 기존 예약을 자동 취소하지 않아요.
            이미 송금한 사실은 계속 신고할 수 있어요.
          </p>
        )}
      </section>
      {q.order && (
        <section className="rounded-card bg-surface p-5 shadow-card">
          <h3 className="font-semibold">전달한 메뉴</h3>
          <ul className="my-4 space-y-3">
            {q.order.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 text-sm">
                <span>
                  {l.name} · {l.unit} × {l.quantity}
                </span>
                <span className="shrink-0">{won(l.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-border pt-4 font-bold">
            <span>메뉴 주문 금액</span>
            <span>{won(q.order.total)}</span>
          </p>
          <p className="mt-2 text-xs text-muted">
            예약금·별도 이용료와 구분한 메뉴 금액이에요. 전달 후 변경은 변경
            문의로 진행해요.
          </p>
        </section>
      )}
    </>
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
        <div className="rounded-control bg-brand p-5 text-white">
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
