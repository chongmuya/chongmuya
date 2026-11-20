import type { EventSummary } from "@/features/settlements/types";
import type { Event } from "../types/event.types";

export function homeEventPath(event: Event, view?: string) {
  return `/events?event=${event.id}${view ? `&view=${view}` : ""}${event.groupId ? `&group=${event.groupId}` : "&scope=personal"}`;
}

// An explicit selection survives returning from an event. Otherwise surface
// unfinished past work first, then the nearest future schedule. Date alone
// never implies a visit, attendance, or settlement completion.
export function featuredEvent(
  events: Event[],
  summaries: EventSummary[],
  selected: string | null,
  now = Date.now(),
) {
  const explicit = events.find((event) => event.id === selected);
  if (explicit) return explicit;
  const facts = new Map(summaries.map((summary) => [summary.eventId, summary]));
  const time = (event: Event) =>
    event.scheduledAt ? Date.parse(event.scheduledAt) : null;
  const tie = (a: Event, b: Event) => a.id.localeCompare(b.id);
  const pastWork = events
    .filter((event) => {
      const when = time(event),
        summary = facts.get(event.id);
      return (
        when !== null &&
        when < now &&
        (summary?.settlement.status === "IN_PROGRESS" ||
          summary?.reservation?.progress === "CHECK_REQUIRED")
      );
    })
    .sort((a, b) => time(b)! - time(a)! || tie(a, b));
  if (pastWork[0]) return pastWork[0];
  const future = events
    .filter((event) => time(event) !== null && time(event)! >= now)
    .sort((a, b) => time(a)! - time(b)! || tie(a, b));
  if (future[0]) return future[0];
  const undated = events.filter((event) => time(event) === null).sort(tie);
  return (
    undated[0] ??
    [...events].sort((a, b) => (time(b) ?? 0) - (time(a) ?? 0) || tie(a, b))[0]
  );
}

export function reservationLabel(summary?: EventSummary) {
  const reservation = summary?.reservation;
  if (reservation?.progress === "REFUND_PENDING") return "환불 확인 중";
  if (reservation?.progress === "REFUND_REVIEW") return "환불 협의 중";
  if (reservation?.status === "CANCELLED") return "예약 취소";
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
  return summary.settlement.status === "COMPLETE"
    ? "정산 완료"
    : summary.settlement.status === "EMPTY"
      ? "정산 입력 전"
      : "정산 진행 중";
}

export function homeAction(summary?: EventSummary): {
  title: string;
  action: string;
  view?: "reservation" | "attendance" | "settlement" | "record";
} {
  if (!summary)
    return {
      title: "행사 진행 상태를\n확인하고 있어요",
      action: "행사 확인하기",
    };
  if (summary?.reservation?.progress === "CHECK_REQUIRED")
    return {
      title: "매장과 함께\n예약을 확인해요",
      action: "예약 확인하기",
      view: "reservation",
    };
  if (summary?.settlement.status === "IN_PROGRESS")
    return {
      title: "모임 비용도\n간편하게 정산해요!",
      action: summary.settlement.drafts
        ? "지출 내용을 확인해 볼까요?"
        : "정산을 확인해 볼까요?",
      view: "settlement",
    };
  if (summary?.settlement.status === "COMPLETE")
    return {
      title: "정산 내역과\n행사 기록을 모아요",
      action: "행사 기록 보기",
      view: "record",
    };
  if (summary?.reservation?.status === "CANCELLED")
    return {
      title: "새 매장을\n찾아볼까요?",
      action: "매장 선택하기",
      view: "reservation",
    };
  if (
    summary?.reservation?.progress === "CONFIRMED" ||
    (summary && !summary.reservation && summary.roundCount > 0)
  )
    return {
      title: "함께할 사람,\n참석을 확인해요!",
      action: "참석 현황 확인하기",
      view: "attendance",
    };
  if (summary?.reservation)
    return {
      title: "선택한 매장과\n예약을 마무리해요",
      action: "예약 마무리하기",
      view: "reservation",
    };
  if (summary?.inquiry?.state === "REPLIES_RECEIVED")
    return {
      title: "도착한 답변을\n나란히 비교해요!",
      action: "매장 답변 확인하기",
      view: "reservation",
    };
  if (summary?.inquiry?.state === "AWAITING_REPLY")
    return {
      title: "매장 답변을\n함께 기다려요",
      action: "문의 진행 상황 보기",
      view: "reservation",
    };
  return {
    title: "참석부터 정산까지\n편하게 준비해요!",
    action: "참석 명단 준비하기",
    view: "attendance",
  };
}

export function compactEventDate(value: string | null) {
  if (!value) return "일정 미정";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}.${part("day")} (${part("weekday")}) ${part("hour")}:${part("minute")}`;
}
