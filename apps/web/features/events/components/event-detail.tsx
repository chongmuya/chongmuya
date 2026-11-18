"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { dateLabel } from "../lib/format-event-date";
import { eventQueryOptions } from "../api/events.queries";

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
    <article className="mb-7 space-y-3">
      <h2 className="text-2xl font-bold">{event.name}</h2>
      <p className="text-xs text-secondary">{dateLabel(event.scheduledAt)}</p>
      {!event.groupId && <p className="text-xs text-secondary">개인 행사</p>}
    </article>
  );
}
