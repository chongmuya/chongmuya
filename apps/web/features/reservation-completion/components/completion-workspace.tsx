"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageVisible } from "@/shared/hooks/use-page-visible";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { completionQuery, completionKey } from "../api/completion.api";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { auditLabel } from "../lib/audit-label";
import {
  CompletionSummary,
  CompletionFacts,
  GuidanceSummary,
  OrderSummary,
  DepositSummary,
} from "./completion-summary";
import { MenuForm } from "./menu-form";
import { PaymentForms } from "./payment-forms";
import { ChangeForms } from "./change-forms";
import { ChangeResult } from "./change-result";
import { AgreementTerms } from "./agreement-terms";
import { ReservationContactButton } from "./reservation-contact";
import { CompletionSteps } from "./completion-steps";
const actionLabels: Record<string, string> = {
  MENU_DRAFT: "메뉴 임시 저장",
  MENU_SUBMITTED: "메뉴 전달",
  GUIDANCE: "예약금 안내",
  GUIDANCE_ACKNOWLEDGED: "안내 확인",
  TRANSFER_REPORTED: "송금 신고",
  RECEIPT_RECORDED: "실입금 확인·정정",
  EXCEPTION_RESOLVED: "예외 확인·재진행",
  CHANGE_REQUESTED: "변경·취소 문의",
  CHANGE_PROPOSED: "처리 내용 제안",
  CHANGE_APPLIED: "합의 적용",
  CHANGE_REJECTED: "처리 불가 안내",
  REFUND_RECORDED: "실제 반환 기록",
  REFUND_PROPOSED: "환불 예정액 제안",
  MANAGEMENT_LINK: "예약 관리 링크 변경",
};
export function CompletionWorkspace({
  id,
  access,
  inquiryContent,
}: {
  id: string;
  access: CompletionAccess;
  inquiryContent?: ReactNode;
}) {
  const cache = useQueryClient(),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!expired) return;
    void cache
      .cancelQueries({ queryKey: completionKey(id, access) })
      .then(() => cache.removeQueries({ queryKey: completionKey(id, access) }));
  }, [expired, id, access, cache]);
  useEffect(() => {
    if (access.kind !== "link") return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(access.accessExpiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [access, id, cache]);
  if (expired)
    return (
      <p role="alert">
        예약 관리 권한이 만료됐거나 폐기됐어요. 문자 링크를 다시 열거나 매장
        담당자에게 새 링크를 요청해 주세요.
      </p>
    );
  return (
    <CompletionContent
      id={id}
      access={access}
      onAccessLost={setExpired}
      inquiryContent={inquiryContent}
    />
  );
}
function CompletionContent({
  id,
  access,
  onAccessLost,
  inquiryContent,
}: {
  id: string;
  access: CompletionAccess;
  onAccessLost: (lost: boolean) => void;
  inquiryContent?: ReactNode;
}) {
  const visible = usePageVisible(),
    titleId = useId();
  const [panel, setPanel] = useState<"details" | "changes" | "payments" | null>(
    null,
  );
  const dialogTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (panel) dialogTitle.current?.focus();
  }, [panel]);
  const [cancelFirst, setCancelFirst] = useState(false);
  const query = useQuery(completionQuery(id, access, visible));
  const denied = isAccessError(query.error);
  useEffect(() => {
    if (denied) onAccessLost(true);
  }, [denied, onAccessLost]);
  if (denied) return null;
  if (!query.data)
    return query.isError ? (
      <>
        <ErrorState retry={() => void query.refetch()} />
        {inquiryContent}
      </>
    ) : (
      <LoadingState>예약 확인 중…</LoadingState>
    );
  const q = query.data,
    organizer = access.kind === "organizer";
  const pending = q.changes.find(
    (c) =>
      c.kind !== "REFUND" &&
      (c.status === "REQUESTED" || c.status === "PROPOSED"),
  );
  const latest = pending ?? q.changes.find((c) => c.kind !== "REFUND");
  const review = () => {
    setCancelFirst(false);
    setPanel("changes");
  };
  const contact = (
    <ReservationContactButton
      id={id}
      access={access}
      onAccessLost={onAccessLost}
    />
  );
  const footer = (
    <div className={latest?.status === "APPLIED" ? "space-y-6" : "space-y-5"}>
      {latest?.status !== "REJECTED" && <CompletionFacts data={q} />}
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {contact}
        <button
          type="button"
          className="relative ml-auto text-sm leading-[normal] font-semibold text-brand before:absolute before:inset-x-0 before:-inset-y-3.5"
          onClick={() => setPanel("details")}
        >
          보낸 예약문의 보기
        </button>
      </div>
      {q.cancellation && organizer && (
        <Button variant="outline" className="w-full" onClick={review}>
          취소·환불 안내
        </Button>
      )}
      {!q.cancellation && q.progress !== "CONFIRMED" && q.order && !pending && (
        <Button className="w-full" onClick={() => setPanel("payments")}>
          예약금 안내 확인하기
        </Button>
      )}
    </div>
  );
  return (
    <div className={organizer ? "space-y-7 pb-7" : "space-y-4 pt-2.5 pb-7"}>
      {query.isError && (
        <ErrorState retry={() => void query.refetch()}>
          최신 내용을 확인하지 못했어요. 입력을 유지한 채 다시 확인해 주세요.
        </ErrorState>
      )}
      {organizer ? (
        <>
          <CompletionSteps current={q.order ? 3 : 2} />
          {latest ? (
            <ChangeResult
              data={q}
              latest={latest}
              organizer
              onReview={review}
              onDetails={() => setPanel("details")}
              onCancel={() => {
                setCancelFirst(true);
                setPanel("changes");
              }}
              footer={footer}
            />
          ) : (
            <CompletionSummary
              data={q}
              organizer
              compact={!q.order && !q.cancellation}
              footer={footer}
            />
          )}
          {!q.order && !q.cancellation && <MenuForm data={q} access={access} />}
          {!pending && latest?.status !== "REJECTED" && !q.cancellation && (
            <section className="space-y-4 rounded-control bg-surface px-5 py-6 shadow-card">
              <h3 className="text-base font-medium">
                예약을 바꾸거나 취소하고 싶나요?
              </h3>
              <p className="text-xs break-keep text-placeholder">
                인원이나 메뉴 변경, 취소·환불은 매장에 확인해 주세요. 문의를
                남겨도 예약이 자동으로 바뀌지는 않아요.
              </p>
              <Button
                variant="outline"
                className="w-full border-placeholder text-copy"
                onClick={review}
              >
                변경·취소 문의하기
              </Button>
            </section>
          )}
        </>
      ) : (
        <>
          <header className="space-y-4">
            <p className="w-fit rounded-pill bg-[#fff2e0] px-3 py-1.5 text-xs font-semibold text-[#b46a00]">
              {pending
                ? "변경 확인 필요"
                : q.cancellation
                  ? "예약 취소 완료"
                  : q.progress === "CONFIRMED"
                    ? "예약 확정"
                    : q.guidance.kind === "REQUIRED"
                      ? "입금 확인 필요"
                      : "예약 준비 중"}
            </p>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">
                {q.groupName || q.eventName}
              </h1>
              {q.groupName && (
                <p className="text-[13px] text-muted">{q.eventName}</p>
              )}
            </div>
          </header>
          <AgreementTerms data={q} compact onOpen={() => setPanel("details")} />
          <OrderSummary data={q} />
          <DepositSummary data={q} />
          {(pending ||
            latest?.status === "REJECTED" ||
            (!q.cancellation &&
              q.guidance.kind === "REQUIRED" &&
              !q.receipt)) && (
            <p className="rounded-[12px] bg-[#fff2e0] px-3.5 py-3 text-xs text-[#b46a00]">
              {pending
                ? "총무의 문의 내용을 확인하고 바꿀 조건을 제안해 주세요. 총무가 수락하면 적용돼요."
                : latest?.status === "REJECTED"
                  ? latest.resolutionReason
                  : "실제 입금을 확인한 뒤 ‘입금을 확인했어요’를 눌러 주세요. 필요한 확인이 완료되면 예약이 확정돼요."}
            </p>
          )}
          <Button
            className="w-full"
            onClick={() =>
              setPanel(
                pending || q.cancellation
                  ? "changes"
                  : q.confirmation
                    ? "details"
                    : "payments",
              )
            }
          >
            {pending
              ? "예약 변경 확인하기"
              : q.cancellation
                ? "취소·환불 안내"
                : q.confirmation
                  ? "예약 내용 확인하기"
                  : q.guidance.kind === "REQUIRED"
                    ? "입금을 확인했어요"
                    : "예약 안내 확인하기"}
          </Button>
          {contact}
        </>
      )}
      {panel && (
        <Dialog
          labelledBy={titleId}
          initialFocusRef={dialogTitle}
          onClose={() => setPanel(null)}
          className="w-[calc(100%-40px)] max-w-[362px] px-5 py-6 text-copy"
        >
          <h2
            id={titleId}
            ref={dialogTitle}
            tabIndex={-1}
            className={
              panel === "changes"
                ? "sr-only"
                : "mb-6 text-center text-xl font-semibold outline-none"
            }
          >
            {panel === "details"
              ? "예약 상세"
              : panel === "changes"
                ? "예약 변경·취소"
                : "예약금 확인"}
          </h2>
          {panel === "details" ? (
            <div className="space-y-4">
              <AgreementTerms data={q} />
              <OrderSummary data={q} />
              <DepositSummary data={q} />
              <GuidanceSummary data={q} />
              {inquiryContent && (
                <section className="pt-4">
                  <h3 className="mb-4 font-semibold">
                    매장 선택 당시 문의·답변
                  </h3>
                  {inquiryContent}
                </section>
              )}
              <details className="pt-4 text-xs">
                <summary>예약 기록·문자 상태</summary>
                <ReservationHistory data={q} />
              </details>
            </div>
          ) : panel === "changes" ? (
            <ChangeForms
              data={q}
              access={access}
              contact={contact}
              initialKind={cancelFirst ? "CANCEL" : undefined}
              onClose={() => setPanel(null)}
              onDetails={() => setPanel("details")}
            />
          ) : (
            <div className="space-y-5">
              <GuidanceSummary data={q} />
              <PaymentForms data={q} access={access} />
              <details className="text-xs">
                <summary>예약 기록·문자 상태</summary>
                <ReservationHistory data={q} />
              </details>
            </div>
          )}
          {panel !== "changes" && (
            <Button
              variant="brand-outline"
              className="mt-7 w-full"
              onClick={() => setPanel(null)}
            >
              뒤로가기
            </Button>
          )}
        </Dialog>
      )}
    </div>
  );
}
function ReservationHistory({ data: q }: { data: Completion }) {
  return (
    <>
      <ul className="mt-4 space-y-3">
        {q.changes.map((change) => (
          <li key={change.id}>
            <p>{change.reason}</p>
            {change.resolutionReason && <p>{change.resolutionReason}</p>}
            {change.proposal && <p>{change.proposal.reason}</p>}
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-4">
        {q.history.map((h) => (
          <li key={h.version}>
            {actionLabels[h.action] ?? "예약 기록"} ·{" "}
            {koreanDateLabel(h.audit.confirmedAt)}
            <p>
              {auditLabel(h.audit)} · 기록 시각{" "}
              {koreanDateLabel(h.audit.recordedAt)}
            </p>
            <p>{h.audit.reason}</p>
            {h.refund && (
              <p>
                실제 반환 {h.refund.amount.toLocaleString()}원 · 반환 시각{" "}
                {koreanDateLabel(h.refund.refundedAt)} · 당시 예정{" "}
                {h.refund.expected === null
                  ? "미확인"
                  : `${h.refund.expected.toLocaleString()}원`}{" "}
                · 누적 반환과 예정의 차이{" "}
                {h.refund.variance === null
                  ? "미확인"
                  : `${h.refund.variance.toLocaleString()}원`}
              </p>
            )}
            <p>
              {koreanDateLabel(h.agreement.startsAt)} ·{" "}
              {h.agreement.expectedGuests}명 · 당시 예약금{" "}
              {h.guidance.kind === "NONE"
                ? "없음"
                : h.guidance.amount === null
                  ? "미확인"
                  : `${h.guidance.amount.toLocaleString()}원`}
            </p>
            <p>{h.guidance.policy}</p>
            <p>
              실제 수령 {h.receivedAmount.toLocaleString()}원 · 실제 반환{" "}
              {h.refundedAmount.toLocaleString()}원
            </p>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2">
        {q.notifications.map((n) => (
          <li key={n.id}>
            {(
              {
                PENDING: "발송 대기",
                PROCESSING: "발송 중",
                ACCEPTED: "접수 완료",
                DELIVERED: "전달 완료",
                FAILED: "발송 실패 · 운영 확인 필요",
                HELD: "발송 보류",
                UNKNOWN: "접수 확인 필요 · 자동 재발송하지 않아요",
              } as Record<string, string>
            )[n.status] ?? "발송 상태 확인 필요"}
          </li>
        ))}
      </ul>
    </>
  );
}
