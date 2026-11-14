"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { dateLabel } from "../lib/format-event-date";
import { eventQueryOptions } from "../api/events.queries";
import { LinkEventGroupForm } from "./link-event-group-form";

export function EventDetail({
  accountId,
  eventId,
  request,
}: {
  accountId: string;
  eventId: string;
  request: SessionRequest;
}) {
  const detail = useQuery(eventQueryOptions(accountId, eventId, request));
  if (detail.isError) return <ErrorState retry={() => void detail.refetch()} />;
  if (!detail.data) return <LoadingState>행사 확인 중…</LoadingState>;
  const event = detail.data;
  return (
    <article>
      <h2>{event.name}</h2>
      <p>{dateLabel(event.scheduledAt)}</p>
      {event.groupId ? (
        <p role="status">
          모임에 연결된 행사입니다.{" "}
          <Link href={`/events?group=${encodeURIComponent(event.groupId)}`}>
            모임별 내 행사 보기
          </Link>
        </p>
      ) : (
        <>
          <p>모임 없이 이용하는 개인 행사입니다.</p>
          <LinkEventGroupForm
            key={event.version}
            accountId={accountId}
            event={event}
            request={request}
            refresh={() => void detail.refetch()}
          />
        </>
      )}
    </article>
  );
}
