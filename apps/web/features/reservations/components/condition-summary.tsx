import Image from "next/image";

export function ConditionSummary({
  conditions,
}: {
  conditions: {
    expectedGuests: number | null;
    startsAt: string | null;
    region: string;
  };
}) {
  const date =
    conditions.startsAt &&
    new Date(conditions.startsAt).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Seoul",
    });
  return (
    <ul
      aria-label="예약 조건 요약"
      className="flex flex-wrap items-center gap-y-2 text-xs text-secondary"
    >
      {[
        [
          "guests",
          conditions.expectedGuests && `${conditions.expectedGuests}명`,
          17,
          15,
        ],
        ["date", date, 18, 18],
        ["location", conditions.region, 18, 18],
      ].map(
        ([icon, label, width, height]) =>
          label && (
            <li
              key={icon}
              className="flex items-center gap-2 not-first:ml-3 not-first:before:mr-1 not-first:before:h-2.5 not-first:before:border-l not-first:before:border-field"
            >
              <Image
                src={`/images/restaurants/${icon}.svg`}
                alt=""
                width={Number(width)}
                height={Number(height)}
              />
              <span>{label}</span>
            </li>
          ),
      )}
    </ul>
  );
}
