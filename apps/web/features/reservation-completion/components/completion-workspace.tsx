"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageVisible } from "@/shared/hooks/use-page-visible";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { NoticeDialog } from "@/shared/ui/notice-dialog";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { completionQuery, completionKey } from "../api/completion.api";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { auditLabel } from "../lib/audit-label";
import { merchantNextStep } from "../lib/merchant-next-step";
import { depositGuidanceReady } from "../lib/deposit-guidance";
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
  sentInquiryContent,
}: {
  id: string;
  access: CompletionAccess;
  inquiryContent?: ReactNode;
  sentInquiryContent?: ReactNode;
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
      sentInquiryContent={sentInquiryContent}
    />
  );
}
function CompletionContent({
  id,
  access,
  onAccessLost,
  inquiryContent,
  sentInquiryContent,
}: {
  id: string;
  access: CompletionAccess;
  onAccessLost: (lost: boolean) => void;
  inquiryContent?: ReactNode;
  sentInquiryContent?: ReactNode;
}) {
  const visible = usePageVisible(),
    titleId = useId();
  const [panel, setPanel] = useState<
    | "details"
    | "changes"
    | "payments"
    | "receipt"
    | "sentInquiry"
    | "confirmed"
    | null
  >(null);
  const dialogTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (panel) dialogTitle.current?.focus();
  }, [panel]);
  const [cancelFirst, setCancelFirst] = useState(false);
  const [guidanceSent, setGuidanceSent] = useState(false);
  const [continuedChangeId, setContinuedChangeId] = useState<string>();
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
  const guidanceReady = depositGuidanceReady(q);
  const paymentInProgress =
    !guidanceReady ||
    (q.guidance.kind === "REQUIRED" && !q.transfer && !q.receipt);
  const pending = q.changes.find(
    (c) =>
      c.kind !== "REFUND" &&
      (c.status === "REQUESTED" || c.status === "PROPOSED"),
  );
  const mostRecent = pending ?? q.changes.find((c) => c.kind !== "REFUND");
  const latest =
    organizer &&
    !q.cancellation &&
    mostRecent?.status === "REJECTED" &&
    (mostRecent.id === continuedChangeId ||
      (q.progress === "CONFIRMED" &&
        q.confirmation &&
        mostRecent.resolvedAt &&
        Date.parse(q.confirmation.at) >= Date.parse(mostRecent.resolvedAt)))
      ? undefined
      : mostRecent;
  const rejectionReason =
    latest?.status === "REJECTED" ? latest.resolutionReason : undefined;
  const merchantStep = organizer ? undefined : merchantNextStep(q);
  const hasPaymentActions = !q.cancellation && q.guidance.kind !== "NONE";
  const isFirstReceipt =
    !organizer &&
    guidanceReady &&
    q.guidance.kind === "REQUIRED" &&
    !q.receipt &&
    !q.cancellation;
  const panelTitles = {
    details: "예약 상세",
    changes: "예약 변경·취소",
    payments: organizer
      ? "예약금 확인"
      : q.guidance.kind === "NONE"
        ? "예약 진행 확인"
        : !guidanceReady
          ? "예약금 안내"
          : "예약금 관리",
    receipt: isFirstReceipt
      ? "실입금 확인"
      : q.guidance.kind === "NONE"
        ? "예약 진행 확인"
        : "예약금 관리",
    sentInquiry: "보낸 예약 문의",
  };
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
        {sentInquiryContent && (
          <button
            type="button"
            aria-haspopup="dialog"
            className="relative ml-auto text-sm leading-[normal] font-semibold text-brand before:absolute before:inset-x-0 before:-inset-y-3.5"
            onClick={() => setPanel("sentInquiry")}
          >
            보낸 예약문의 보기
          </button>
        )}
      </div>
      {q.cancellation && organizer && (
        <Button variant="outline" className="w-full" onClick={review}>
          취소·환불 안내
        </Button>
      )}
      {!q.cancellation &&
        guidanceReady &&
        q.progress !== "CONFIRMED" &&
        (q.guidance.kind === "REQUIRED" ||
          q.issues.includes("GUIDANCE_REVIEW")) &&
        q.order &&
        !pending && (
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
          <CompletionSteps
            current={
              q.progress === "CONFIRMED"
                ? 4
                : q.order && !paymentInProgress
                  ? 3
                  : 2
            }
          />
          {latest ? (
            <ChangeResult
              data={q}
              latest={latest}
              organizer
              onReview={review}
              onContinue={() => {
                if (q.cancellation) setPanel("details");
                else setContinuedChangeId(latest.id);
              }}
              onCancel={() => {
                setCancelFirst(true);
                setPanel("changes");
              }}
              footer={footer}
            />
          ) : (
            (q.order || q.cancellation) && (
              <CompletionSummary data={q} organizer footer={footer} />
            )
          )}
          {!q.order && !q.cancellation && <MenuForm data={q} access={access} />}
          {q.order &&
            !pending &&
            latest?.status !== "REJECTED" &&
            !q.cancellation && (
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
      ) : merchantStep ? (
        <>
          <header className="space-y-4">
            {guidanceSent && (
              <p role="status" className="text-sm font-medium text-brand-ink">
                예약금 안내를 보냈어요
              </p>
            )}
            <p className="w-fit rounded-pill bg-soft px-3 py-1.5 text-xs font-semibold text-brand-ink">
              {merchantStep.status}
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
          <AgreementTerms
            data={q}
            compact
            merchant
            onOpen={() => setPanel("details")}
          />
          <OrderSummary data={q} />
          <DepositSummary data={q} merchant />
          {merchantStep.note && (
            <p className="text-sm text-muted">{merchantStep.note}</p>
          )}
          {!pending && q.progress !== "CONFIRMED" && rejectionReason && (
            <p className="text-sm text-muted">
              변경 불가 답변 · {rejectionReason}
            </p>
          )}
          <Button
            className="w-full"
            onClick={() => {
              setGuidanceSent(false);
              setPanel(merchantStep.panel);
            }}
          >
            {merchantStep.label}
          </Button>
          {contact}
        </>
      ) : null}
      {panel === "confirmed" ? (
        <NoticeDialog
          title={
            <span className="inline-block text-balance break-keep">
              예약이 최종 확정됐어요
            </span>
          }
          description={`${q.eventName} · ${koreanDateLabel(q.agreement.startsAt)} · ${q.agreement.expectedGuests}명`}
          onClose={() => setPanel(null)}
        >
          <Button onClick={() => setPanel(null)}>확인</Button>
        </NoticeDialog>
      ) : panel ? (
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
            {panelTitles[panel]}
          </h2>
          {panel === "sentInquiry" ? (
            sentInquiryContent
          ) : panel === "details" ? (
            <div className="space-y-4">
              <AgreementTerms data={q} merchant={!organizer} />
              <OrderSummary data={q} />
              <DepositSummary data={q} merchant={!organizer} />
              {organizer && <GuidanceSummary data={q} />}
              {inquiryContent && (
                <section className="pt-4">
                  <h3 className="mb-4 font-semibold">
                    매장 선택 당시 문의·답변
                  </h3>
                  {inquiryContent}
                </section>
              )}
              {!organizer && hasPaymentActions && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setPanel("payments")}
                >
                  예약금 관리
                </Button>
              )}
              {organizer ? (
                <details className="pt-4 text-xs">
                  <summary>예약 기록·문자 상태</summary>
                  <ReservationHistory data={q} />
                </details>
              ) : q.history.length > 0 ? (
                <details className="rounded-control bg-soft p-4 text-sm">
                  <summary className="cursor-pointer font-medium">
                    처리 이력
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {q.history.map((h) => (
                      <li key={h.version}>
                        <p>{actionLabels[h.action] ?? "예약 기록"}</p>
                        <p className="text-xs text-muted">
                          {koreanDateLabel(h.audit.confirmedAt)}
                          {h.action === "RECEIPT_RECORDED" &&
                            ` · 수령 ${h.receivedAmount.toLocaleString("ko-KR")}원`}
                          {h.refund &&
                            ` · 반환 ${h.refund.amount.toLocaleString("ko-KR")}원`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
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
              {(organizer ||
                (q.guidance.kind !== "NONE" &&
                  guidanceReady &&
                  (panel === "payments" || !isFirstReceipt))) && (
                <GuidanceSummary data={q} merchant={!organizer} />
              )}
              <PaymentForms
                data={q}
                access={access}
                showGuidance={panel === "payments"}
                onConfirmed={() => setPanel("confirmed")}
                onGuidanceSent={() => {
                  setPanel(null);
                  setGuidanceSent(true);
                }}
              />
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
      ) : null}
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
