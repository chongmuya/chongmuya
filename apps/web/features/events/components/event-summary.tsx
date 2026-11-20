"use client";
import { eventSummariesQuery } from "@/features/settlements/client";
import { isAccessError } from "@/shared/http/access-error";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ActiveEventBanner, EventBanner } from "./event-banner";
import { EventCard } from "./event-card";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { eventsQueryOptions } from "../api/events.queries";
import { featuredEvent } from "../lib/home-event";

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
  const params = useSearchParams();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const events = useQuery(eventsQueryOptions(accountId, request, groupId));
  const visible = isAccessError(events.error)
    ? undefined
    : personal
      ? events.data?.filter((e) => e.groupId === null)
      : events.data;
  const summaries = useQuery(
    eventSummariesQuery({
      accountId,
      request,
      eventIds: visible?.map((event) => event.id) ?? [],
    }),
  );
  const accessLost = isAccessError(summaries.error);
  const shown = accessLost ? undefined : visible;
  const summaryById = new Map(
    summaries.data?.map((summary) => [summary.eventId, summary]),
  );
  const featured =
    shown &&
    featuredEvent(
      shown,
      summaries.isError ? [] : (summaries.data ?? []),
      params.get("event"),
      now,
    );
  const createPath = groupId
    ? `/events?group=${groupId}`
    : personal
      ? "/events?scope=personal"
      : "/events";
  return (
    <section className="space-y-4">
      {shown &&
        (featured ? (
          <ActiveEventBanner
            event={featured}
            summary={
              summaries.isError ? undefined : summaryById.get(featured.id)
            }
            summaryUnavailable={summaries.isError}
            createPath={createPath}
            now={now}
          />
        ) : (
          !events.isError && <EventBanner href={createPath} />
        ))}
      <div className="flex items-center justify-between gap-3 pt-4">
        <h2 className="text-label text-copy">
          {groupId ? "우리 모임 행사" : personal ? "개인 행사" : "내 행사"}
          {shown && (
            <span className="ml-2 text-caption text-brand">{shown.length}</span>
          )}
        </h2>
        {!!shown?.length && (
          <Link
            href={createPath}
            className={buttonStyles({
              variant: "ink",
              className: "shrink-0 text-sm",
            })}
          >
            새 행사 <span aria-hidden="true">＋</span>
          </Link>
        )}
      </div>
      {events.isError && <ErrorState retry={() => void events.refetch()} />}
      {summaries.isError && (
        <ErrorState retry={() => void summaries.refetch()}>
          {accessLost
            ? "현재 관리 권한을 확인할 수 없어요."
            : "행사 진행 상태를 불러오지 못했어요."}
        </ErrorState>
      )}
      {!shown ? (
        !events.isError &&
        !accessLost && <LoadingState>행사 불러오는 중…</LoadingState>
      ) : shown.length ? (
        <ul className="space-y-3">
          {shown.map((event) => (
            <li key={event.id}>
              <EventCard
                event={event}
                summary={summaryById.get(event.id)}
                summaryUnavailable={summaries.isError}
              />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-sm leading-normal text-muted">
            등록된 행사가 없어요. 행사를 추가해 준비해봐요.
          </p>
          <Link
            href={createPath}
            className={buttonStyles({ variant: "ink", className: "text-sm" })}
          >
            새 행사 <span aria-hidden="true">＋</span>
          </Link>
        </>
      )}
    </section>
  );
}
