import { progressLabels } from "@/features/reservation-completion/client";
import type { CalendarData } from "../types/calendar";
export function reservationLabel(
  r: NonNullable<CalendarData["reservations"]>[number],
) {
  if (r.progress && progressLabels[r.progress])
    return progressLabels[r.progress];
  return (
    (
      {
        PREPARING: "선택됨 · 준비 중",
        CONFIRMED: "확정",
        CANCELLED: "취소",
        CHECK_REQUIRED: "확인 필요",
        OFFERED: "가능 제안 · 선택 기한까지 자리 확보",
        INQUIRY: "문의",
        EXPIRED: "제안 만료",
        OTHER_SELECTED: "후보 종료",
        MERCHANT_DECLINED: "불가",
        ORGANIZER_DECLINED: "제안 거절",
        OPERATOR_CLOSED: "종료",
        SELECTED: "선택됨",
        OPEN: "문의",
      } as Record<string, string>
    )[r.status] ?? "종료"
  );
}
