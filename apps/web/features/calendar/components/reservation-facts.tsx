import type { CalendarData } from "../types/calendar";
import Image from "next/image";

export function ReservationFacts({
  reservation: r,
}: {
  reservation: NonNullable<CalendarData["reservations"]>[number];
}) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-secondary">
      <span className="inline-flex items-center gap-2">
        <Image
          src="/images/calendar/guests.svg"
          width={16.848}
          height={14.8528}
          alt=""
          style={{ height: "auto" }}
        />
        {r.expectedGuests}명
      </span>
      {r.orderTotal !== null ? (
        <span className="inline-flex items-center gap-2">
          <Image
            src="/images/calendar/budget.svg"
            width={17.2}
            height={13.2}
            alt=""
            style={{ height: "auto" }}
          />
          메뉴 주문 {r.orderTotal.toLocaleString()}원
        </span>
      ) : (
        r.budgetAmount !== null && (
          <span className="inline-flex items-center gap-2">
            <Image
              src="/images/calendar/budget.svg"
              width={17.2}
              height={13.2}
              alt=""
              style={{ height: "auto" }}
            />
            문의 예산 {r.budgetBasis === "PER_PERSON" ? "1인 " : "총 "}
            {r.budgetAmount.toLocaleString()}원
          </span>
        )
      )}
      {r.region && (
        <span className="inline-flex items-center gap-2">
          <Image
            src="/images/calendar/location.svg"
            width={18}
            height={18}
            alt=""
            style={{ height: "auto" }}
          />
          {r.region}
        </span>
      )}
      {r.depositAmount !== null && (
        <span>안내 예약금 {r.depositAmount.toLocaleString()}원</span>
      )}
    </p>
  );
}
