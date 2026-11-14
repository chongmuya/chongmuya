"use client";

import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { dateLabel } from "../lib/format-event-date";

type Props = { accountId: string; groupId: string; request: SessionRequest };

import { eventQueryOptions } from "../api/events.queries";

export function EventDetail({
  accountId,
  groupId,
  eventId,
  request,
}: Props & { eventId: string }) {
  const detail = useQuery(
    eventQueryOptions(accountId, groupId, eventId, request),
  );
  if (detail.isError) return <ErrorState retry={() => void detail.refetch()} />;
  if (!detail.data) return <LoadingState>행사 확인 중…</LoadingState>;
  return (
    <article>
      <h2>{detail.data.name}</h2>
      <p>{dateLabel(detail.data.scheduledAt)}</p>
      <p>명단과 예약 없이 만든 행사입니다. 행사 준비를 시작해 보세요.</p>
    </article>
  );
}
