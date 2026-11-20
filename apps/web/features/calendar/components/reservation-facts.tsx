import type { CalendarData } from "../types/calendar";

export function ReservationFacts({
  reservation: r,
}: {
  reservation: NonNullable<CalendarData["reservations"]>[number];
}) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-secondary">
      <span>{r.expectedGuests}명</span>
      {r.orderTotal !== null ? (
        <span>메뉴 주문 {r.orderTotal.toLocaleString()}원</span>
      ) : (
        r.budgetAmount !== null && (
          <span>
            문의 예산 {r.budgetBasis === "PER_PERSON" ? "1인 " : "총 "}
            {r.budgetAmount.toLocaleString()}원
          </span>
        )
      )}
      {r.region && <span>{r.region}</span>}
      {r.depositAmount !== null && (
        <span>안내 예약금 {r.depositAmount.toLocaleString()}원</span>
      )}
    </p>
  );
}
