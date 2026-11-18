"use client";
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
}: {
  accountId: string;
  request: SessionRequest;
  groupId?: string;
}) {
  const events = useQuery(eventsQueryOptions(accountId, request, groupId));
  return (
    <section className="space-y-4">
      <h2 className="text-label">
        {groupId ? "우리 모임 행사" : "내 행사"}
        {events.data && !events.isError && (
          <span className="ml-2 text-caption text-brand">
            {events.data.length}
          </span>
        )}
      </h2>
      {events.isError ? (
        <ErrorState retry={() => void events.refetch()} />
      ) : !events.data ? (
        <LoadingState>행사 불러오는 중…</LoadingState>
      ) : events.data.length ? (
        <ul className="space-y-3">
          {events.data.map((event) => (
            <li key={event.id}>
              <Link
                className="block rounded-control bg-surface p-4 shadow-control"
                href={`/events?event=${event.id}`}
              >
                <span className="block font-semibold break-words">
                  {event.name}
                </span>
                <span className="text-caption text-muted">
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
      <Link
        href={groupId ? `/events?group=${groupId}` : "/events"}
        className={buttonStyles({ variant: "ink", className: "text-caption" })}
      >
        새 행사{" "}
        <span aria-hidden="true" className="ml-1">
          ＋
        </span>
      </Link>
      {groupId && (
        <Link className="ml-4 text-caption text-link underline" href="/events">
          개인 행사·전체 행사 보기
        </Link>
      )}
    </section>
  );
}
