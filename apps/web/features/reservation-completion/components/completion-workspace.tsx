"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { completionQuery, completionKey } from "../api/completion.api";
import type { CompletionAccess } from "../types/completion.types";
import { CompletionSummary, GuidanceSummary } from "./completion-summary";
import { MenuForm } from "./menu-form";
import { PaymentForms } from "./payment-forms";
import { ChangeForms } from "./change-forms";
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
  REFUND_PLAN: "환불 예정액 확인",
  MANAGEMENT_LINK: "예약 관리 링크 변경",
};
export function CompletionWorkspace({
  id,
  access,
}: {
  id: string;
  access: CompletionAccess;
}) {
  const query = useQuery(completionQuery(id, access)),
    cache = useQueryClient(),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    if (access.kind !== "link") return;
    const timer = setTimeout(
      () => {
        setExpired(true);
        cache.removeQueries({ queryKey: completionKey(id, access) });
      },
      Math.max(0, Date.parse(access.accessExpiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [access, id, cache]);
  if (expired || isAccessError(query.error))
    return (
      <p role="alert">
        예약 관리 권한이 만료됐거나 폐기됐어요. 문자 링크를 다시 열거나 매장
        담당자에게 새 링크를 요청해 주세요.
      </p>
    );
  if (!query.data)
    return query.isError ? (
      <ErrorState retry={() => void query.refetch()} />
    ) : (
      <LoadingState>예약 확인 중…</LoadingState>
    );
  const q = query.data;
  return (
    <div className="space-y-6 py-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">예약 관리</h1>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          loading={query.isFetching}
        >
          새로고침
        </Button>
      </header>
      {query.isError && (
        <ErrorState retry={() => void query.refetch()}>
          최신 내용을 확인하지 못했어요. 입력을 유지한 채 다시 확인해 주세요.
        </ErrorState>
      )}
      <CompletionSummary data={q} organizer={access.kind === "organizer"} />
      <GuidanceSummary data={q} />
      {access.kind === "organizer" && !q.order && !q.cancellation && (
        <MenuForm data={q} access={access} />
      )}
      <PaymentForms data={q} access={access} />
      <ChangeForms data={q} access={access} />
      <details className="rounded-control bg-surface p-5 text-xs shadow-card">
        <summary>예약 기록·문자 상태</summary>
        <ul className="mt-4 space-y-4">
          {q.history.map((h) => (
            <li key={h.version}>
              {actionLabels[h.action] ?? "예약 기록"} ·{" "}
              {koreanDateLabel(h.audit.confirmedAt)}
              <p>
                확인자 {h.audit.confirmer} · 방법 {h.audit.method} · 기록자{" "}
                {h.audit.recorder} · 기록 시각{" "}
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
              )[n.status] ?? n.status}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
