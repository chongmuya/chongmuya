import Link from "next/link";
import { cn } from "@/shared/lib/cn";

export function EventNavigation({
  eventId,
  view,
}: {
  eventId: string;
  view: string | null | undefined;
}) {
  const attendance = view === "attendance" || view === "roster";
  return (
    <nav
      aria-label="행사 관리"
      className="mb-7 flex gap-6 border-b border-field"
    >
      {(
        [
          ["reservation", "예약", !attendance],
          ["attendance", "참석", attendance],
        ] as const
      ).map(([value, label, active]) => (
        <Link
          key={String(value)}
          href={`/events?event=${eventId}&view=${value}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex min-h-control items-center px-3 pb-2 text-control",
            active
              ? "font-semibold text-brand-action after:absolute after:bottom-[-3px] after:left-[calc(50%-3px)] after:size-1.5 after:rounded-full after:bg-brand"
              : "text-secondary",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
