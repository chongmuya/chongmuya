import { koreanDateOnly } from "@/shared/lib/korean-date";
import type { EventSummary } from "@/features/settlements/types";
import type { Event } from "../types/event.types";

export function homeEventPath(event: Event, view?: string) {
  return `/events?event=${event.id}${view ? `&view=${view}` : ""}${event.groupId ? `&group=${event.groupId}` : "&scope=personal"}`;
}

// Callers supply events already filtered to the current home scope.
export function featuredEvent(
  events: Event[],
  summaries: EventSummary[],
  selected: string | null,
  now = Date.now(),
) {
  const explicit = events.find((event) => event.id === selected);
  if (explicit) return explicit;
  const facts = new Map(summaries.map((summary) => [summary.eventId, summary]));
  const ranked = events.map((event) => ({
    event,
    time: event.scheduledAt === null ? Infinity : Date.parse(event.scheduledAt),
    action: homeAction(event, facts.get(event.id), now),
  }));
  const active = ranked.filter(({ action }) => !action.completed);
  const candidates = active.length ? active : ranked;
  const priority = ({ time, action }: (typeof ranked)[number]) => {
    if (time < now && action.pastWork) return 0;
    if (Number.isFinite(time) && time >= now) return 1;
    if (!Number.isFinite(time)) return 2;
    return 3;
  };
  return candidates.sort((a, b) => {
    const rank = priority(a);
    return (
      rank - priority(b) ||
      (rank === 1 ? a.time - b.time : b.time - a.time) ||
      a.event.id.localeCompare(b.event.id)
    );
  })[0]?.event;
}

export function reservationLabel(summary?: EventSummary) {
  const reservation = summary?.reservation;
  if (reservation?.progress === "REFUND_PENDING") return "환불 확인 중";
  if (reservation?.progress === "REFUND_REVIEW") return "환불 협의 중";
  if (reservation?.status === "CANCELLED") return "예약 취소 완료";
  if (reservation?.progress === "CHECK_REQUIRED") return "예약 확인 필요";
  if (reservation?.progress === "CONFIRMED") return "예약 확정";
  if (reservation) return "예약 준비 중";
  if (summary?.inquiry?.state === "REPLIES_RECEIVED") return "답변 도착";
  if (summary?.inquiry?.state === "AWAITING_REPLY") return "답변 대기";
  if (summary?.inquiry?.state === "CLOSED") return "문의 종료";
  return summary ? "예약 미선택" : "예약 확인 중";
}

export function settlementLabel(summary?: EventSummary) {
  if (!summary) return "정산 확인 중";
  if (summary.settlement.needsReview) return "정산 재확인 필요";
  return summary.settlement.status === "COMPLETE"
    ? "정산 완료"
    : summary.settlement.status === "EMPTY"
      ? "정산 입력 전"
      : "정산 진행 중";
}

type ProgressView = "reservation" | "attendance" | "settlement" | "record";

type HomeAction = {
  title: string;
  action: string;
  view?: ProgressView;
  target?: "venue" | "expense";
  pastWork?: boolean;
  completed?: true;
};

// The existing list card keeps its destination and does not depend on the
// banner's date or finalization policy.
export function eventCardView(
  event: Event,
  summary?: EventSummary,
): ProgressView | undefined {
  if (!summary) return;
  if (summary.settlement.needsReview) return "settlement";
  if (summary.reservation?.progress === "CHECK_REQUIRED") return "reservation";
  if (summary.settlement.status === "IN_PROGRESS") return "settlement";
  if (summary.settlement.status === "COMPLETE") return "record";
  if (summary.reservation?.status === "CANCELLED") return "reservation";
  if (summary.reservation?.progress === "CONFIRMED") return "attendance";
  if (summary.reservation) return "reservation";
  return (summary.inquiry && summary.inquiry.state !== "CLOSED") ||
    (event.expectedGuests != null && !summary.hasAttendanceRecords)
    ? "reservation"
    : "attendance";
}

export function homeAction(
  event: Event,
  summary?: EventSummary,
  now = Date.now(),
): HomeAction {
  if (!summary)
    return {
      title: "행사 진행 상태를\n확인하고 있어요",
      action: "행사 확인하기",
    };
  const { reservation, settlement } = summary;
  if (settlement.needsReview)
    return {
      title: "정산 재확인이\n필요해요",
      action: "연결 지출 확인하기",
      view: "settlement",
      pastWork: true,
    };
  if (reservation?.progress === "CHECK_REQUIRED")
    return {
      title: "매장과 함께\n예약을 확인해요",
      action: "예약 확인하기",
      view: "reservation",
      pastWork: true,
    };
  if (
    reservation?.progress === "REFUND_REVIEW" ||
    reservation?.progress === "REFUND_PENDING"
  )
    return {
      title: "예약 취소 후\n환불을 확인해요",
      action: reservationLabel(summary),
      view: "reservation",
      pastWork: true,
    };
  if (settlement.status === "IN_PROGRESS")
    return {
      title: "모임 비용도\n간편하게 정산해요!",
      action: settlement.drafts
        ? "지출 내용을 확인해 볼까요?"
        : "정산을 확인해 볼까요?",
      view: "settlement",
      pastWork: true,
    };
  if (summary.finalizedAt)
    return {
      title: "이번 행사도 수고했어요!\n다음에도 함께해요.",
      action: "새로운 행사를 계획해 볼까요?",
      completed: true,
    };
  if (settlement.status === "COMPLETE")
    return {
      title: "마무리까지\n깔끔하게 정리해요!",
      action: "영수증을 정리해볼까요?",
      view: "record",
      pastWork: true,
    };
  const confirmed = reservation?.progress === "CONFIRMED";
  if (
    event.scheduledAt &&
    (confirmed || summary.hasAttendanceRecords) &&
    koreanDateOnly(new Date(event.scheduledAt)) < koreanDateOnly(new Date(now))
  )
    return {
      title: "모임 비용도\n간편하게 정산해요!",
      action: "이제 정산을 시작해볼까요?",
      view: "settlement",
      target: "expense",
      pastWork: true,
    };
  if (reservation?.status === "CANCELLED")
    return {
      title: "새 매장을\n찾아볼까요?",
      action: "매장 선택하기",
      view: "reservation",
      target: "venue",
    };
  if (
    confirmed ||
    (!reservation &&
      (!summary.inquiry || summary.inquiry.state === "CLOSED") &&
      (summary.hasAttendanceRecords ||
        (event.expectedGuests == null && summary.roundCount > 0)))
  )
    return {
      title: "함께할 사람들을\n확인해볼까요?",
      action: "참석 현황을 확인해볼까요?",
      view: "attendance",
    };
  if (reservation)
    return {
      title: "선택한 매장과\n예약을 마무리해요",
      action: "예약 마무리하기",
      view: "reservation",
    };
  if (summary.inquiry?.state === "REPLIES_RECEIVED")
    return {
      title: "도착한 답변을\n나란히 비교해요!",
      action: "매장 답변 확인하기",
      view: "reservation",
    };
  if (summary.inquiry?.state === "AWAITING_REPLY")
    return {
      title: "매장 답변을\n함께 기다려요",
      action: "문의 진행 상황 보기",
      view: "reservation",
    };
  return {
    title: "행사에 딱 맞는\n식당을 찾아볼까요?",
    action: "매장에 문의해볼까요?",
    view: "reservation",
    target: "venue",
  };
}

export function homeActionPath(
  event: Event,
  summary: EventSummary | undefined,
  next: HomeAction,
) {
  if (next.target === "expense")
    return `${homeEventPath(event, "settlement")}&action=expense`;
  if (next.target === "venue") {
    const request = summary?.inquiry?.requestId;
    return `/restaurants?event=${event.id}&inquiry=1&view=${request ? `list&reinquire=${request}` : "conditions"}`;
  }
  return homeEventPath(event, next.view);
}
