import type { Completion } from "../types/completion.types";
import { depositGuidanceReady } from "./deposit-guidance";
import { progressLabels } from "./progress-labels";

export function merchantNextStep(q: Completion): {
  status: string;
  label: string;
  panel: "changes" | "payments" | "details";
  note?: string;
} {
  if (q.cancellation)
    return {
      status: progressLabels[q.progress] ?? "예약 취소",
      label: "취소·환불 보기",
      panel: "changes",
    };
  const pending = q.changes.find(
    (change) =>
      change.kind !== "REFUND" &&
      (change.status === "REQUESTED" || change.status === "PROPOSED"),
  );
  if (pending?.status === "REQUESTED")
    return {
      status: "변경·취소 요청",
      label: "요청에 답하기",
      panel: "changes",
    };
  if (pending?.status === "PROPOSED")
    return {
      status: "총무 답변 대기",
      label: "보낸 처리안 보기",
      panel: "changes",
    };
  if (!depositGuidanceReady(q))
    return {
      status: "예약금 안내 필요",
      label: "예약금 안내하기",
      panel: "payments",
    };
  if (q.progress === "CHECK_REQUIRED")
    return {
      status: "확인 필요",
      label: "확인할 내용 보기",
      panel: "payments",
    };
  if (q.guidance.kind === "REQUIRED" && !q.receipt)
    return {
      status: q.transfer ? "송금 신고 접수" : "입금 대기",
      label: "실입금 확인",
      panel: "payments",
      note: "은행 내역에서 입금이 확인되면 수령액을 기록해 주세요.",
    };
  return {
    status:
      q.progress === "CONFIRMED"
        ? "예약 확정"
        : q.progress === "MENU_REQUIRED"
          ? "메뉴 전달 대기"
          : q.progress === "GUIDANCE_REVIEW"
            ? "총무 안내 확인 대기"
            : "예약 준비 중",
    label: "예약 내용 보기",
    panel: "details",
  };
}
