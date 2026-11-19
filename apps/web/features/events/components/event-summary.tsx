"use client";
import { isAccessError } from "@/shared/http/access-error";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { eventsQueryOptions } from "../api/events.queries";
import { dateLabel } from "../lib/format-event-date";

export function EventSummary({
  accountId,
  request,
  groupId,
  personal = false,
}: {
  accountId: string;
  request: SessionRequest;
  groupId?: string;
  personal?: boolean;
}) {
  const events = useQuery(eventsQueryOptions(accountId, request, groupId));
  const shown = isAccessError(events.error)
    ? undefined
    : personal
      ? events.data?.filter((e) => e.groupId === null)
      : events.data;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label text-copy">
          {groupId ? "우리 모임 행사" : personal ? "개인 행사" : "내 행사"}
          {shown && (
            <span className="ml-2 text-caption text-brand-action">
              {shown.length}
            </span>
          )}
        </h2>{" "}
        <Link
          href={groupId ? `/events?group=${groupId}` : "/events"}
          className={buttonStyles({ variant: "ink", className: "text-sm" })}
        >
          새 행사{" "}
          <span aria-hidden="true" className="ml-1">
            ＋
          </span>
        </Link>
      </div>
      {events.isError && <ErrorState retry={() => void events.refetch()} />}
      {!shown ? (
        events.isError ? null : (
          <LoadingState>행사 불러오는 중…</LoadingState>
        )
      ) : shown.length ? (
        <ul className="space-y-3">
          {shown.map((event) => (
            <li key={event.id}>
              <Link
                className="block rounded-control bg-surface p-5 shadow-card"
                href={`/events?event=${event.id}`}
              >
                <span className="mb-3 block text-copy font-semibold break-words">
                  {event.name}
                </span>
                <span className="text-xs text-secondary">
                  {dateLabel(event.scheduledAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-control leading-normal text-muted">
          등록된 행사가 없어요. 행사를 추가해 준비해봐요.
        </p>
      )}
    </section>
  );
}
