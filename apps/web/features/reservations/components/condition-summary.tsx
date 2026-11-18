import Image from "next/image";
import type { InquiryConditions } from "../types/inquiry.types";

export function ConditionSummary({
  conditions,
}: {
  conditions: Pick<InquiryConditions, "expectedGuests" | "startsAt" | "region">;
}) {
  const date = new Date(conditions.startsAt).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-secondary">
      {[
        ["guests", `${conditions.expectedGuests}명`, 16.848, 14.8528],
        ["date", date, 18, 18],
        ["location", conditions.region, 18, 18],
      ].map(([icon, label, width, height]) => (
        <li key={icon} className="flex items-center gap-2">
          <Image
            src={`/images/restaurants/${icon}.svg`}
            alt=""
            width={Number(width)}
            height={Number(height)}
          />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
