import type { Change } from "../types/completion.types";

export const changeSubjectLabels: Record<string, string> = {
  SCHEDULE: "날짜·시간",
  GUESTS: "인원",
  MENU: "메뉴",
  OTHER: "기타",
  REFUND: "환불 예정액",
};

export function changeOutcome(change: Change, organizer = false) {
  const topic = change.kind === "CANCEL" ? "취소" : "변경";
  if (change.status === "APPLIED")
    return change.kind === "CANCEL" ? "예약 취소 완료" : "변경 적용 완료";
  if (change.status === "REJECTED") {
    if (change.resolutionBy === "organizer")
      return organizer ? "제안을 거절했어요" : "총무가 제안을 거절했어요";
    if (change.proposal)
      return organizer
        ? `매장이 ${topic}안을 철회했어요`
        : `보낸 ${topic}안을 철회했어요`;
    return organizer
      ? `예약 ${topic}${topic === "취소" ? "가" : "이"} 어려워요`
      : `${topic} 불가 답변 완료`;
  }
}
