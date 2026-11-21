import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import type { EventSummary } from "@/features/settlements/types";
import type { Event } from "../types/event.types";
import {
  compactEventDate,
  eventCardView,
  homeEventPath,
  reservationLabel,
  settlementLabel,
} from "../lib/home-event";

export function EventCard({
  event,
  summary,
  summaryUnavailable = false,
}: {
  event: Event;
  summary?: EventSummary;
  summaryUnavailable?: boolean;
}) {
  const settled =
    summary?.settlement.status === "COMPLETE" &&
    !summary.settlement.needsReview;
  const expectedGuests = summary?.expectedGuests ?? event.expectedGuests;
  return (
    <article className="rounded-[4px] bg-surface shadow-card">
      <Link
        href={homeEventPath(event, eventCardView(event, summary))}
        className="block rounded-[inherit] px-5 py-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-base leading-[1.2] font-medium break-words">
            {event.name}
          </h3>
          <span
            className={cn(
              "flex shrink-0 items-center gap-2 text-xs",
              settled ? "text-brand-ink" : "text-brand",
            )}
          >
            {summary && summary.settlement.status !== "EMPTY" && (
              <Image
                src={`/images/home/${settled ? "complete-status" : "settlement-status"}.svg`}
                width={settled ? 19 : 18.5}
                height={settled ? 19 : 18}
                alt=""
              />
            )}
            {!summary
              ? summaryUnavailable
                ? "상태 확인 불가"
                : "상태 확인 중"
              : summary.settlement.status === "EMPTY"
                ? reservationLabel(summary)
                : settlementLabel(summary)}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs leading-normal text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Image
              src="/images/calendar/guests.svg"
              width={16.848}
              height={14.8528}
              alt=""
            />
            {expectedGuests != null
              ? `예상 ${expectedGuests}명`
              : summary?.hasAttendanceRecords
                ? `참석 ${summary.attendingCount}명`
                : summary?.participantCount
                  ? `명단 ${summary.participantCount}명`
                  : summary
                    ? "인원 미정"
                    : summaryUnavailable
                      ? "인원 확인 불가"
                      : "인원 확인 중"}
          </span>
          <span className="inline-flex items-center gap-1.5 border-l border-placeholder/50 pl-3">
            <Image
              src="/images/home/calendar.svg"
              width={18}
              height={18}
              alt=""
            />
            {compactEventDate(event.scheduledAt)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 border-l border-placeholder/50 pl-3 break-words">
            <Image
              src="/images/calendar/location.svg"
              width={18}
              height={18}
              alt=""
            />
            {summary
              ? (summary.region ?? "지역 미정")
              : summaryUnavailable
                ? "장소 확인 불가"
                : "장소 확인 중"}
          </span>
        </div>
      </Link>
    </article>
  );
}
