import Link from "next/link";
import { cn } from "@/shared/lib/cn";

export function EventNavigation({
  eventId,
  view,
  roundId,
}: {
  eventId: string;
  view: string | null | undefined;
  roundId?: string | null;
}) {
  const attendance = view === "attendance" || view === "roster";
  return (
    <nav
      aria-label="행사 관리"
      className="mb-7 flex border-b border-placeholder pl-1.5"
    >
      {(
        [
          [
            "reservation",
            "예약",
            !attendance && view !== "settlement" && view !== "record",
          ],
          ["attendance", "참석", attendance],
          ["settlement", "정산", view === "settlement"],
          ["record", "기록", view === "record"],
        ] as const
      ).map(([value, label, active]) => (
        <Link
          key={String(value)}
          href={`/events?event=${eventId}&view=${value}${value === "attendance" && attendance && roundId ? `&round=${encodeURIComponent(roundId)}` : ""}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex min-h-8 items-center px-3 pb-1 text-control",
            active
              ? "font-medium text-brand after:absolute after:bottom-[-3px] after:left-[calc(50%-3px)] after:size-1.5 after:rounded-full after:bg-brand"
              : "text-secondary",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
