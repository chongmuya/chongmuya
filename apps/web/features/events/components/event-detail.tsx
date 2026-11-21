"use client";
import { useState } from "react";
import Image from "next/image";
import { EditEvent } from "./edit-event";
import { useGroups } from "@/features/groups/client";
import { eventSummariesQuery } from "@/features/settlements/client";
import { isAccessError } from "@/shared/http/access-error";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { compactEventDate } from "../lib/home-event";
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
  const [editing, setEditing] = useState(false);
  const detail = useQuery(eventQueryOptions(accountId, eventId, request));
  const groups = useGroups(accountId, request);
  const summaries = useQuery(
    eventSummariesQuery({ accountId, eventIds: [eventId], request }),
  );
  if (detail.isError && (!detail.data || isAccessError(detail.error)))
    return <ErrorState retry={() => void detail.refetch()} />;
  if (!detail.data) return <LoadingState>행사 확인 중…</LoadingState>;
  const event = detail.data;
  const summary = isAccessError(summaries.error)
    ? undefined
    : summaries.data?.[0];
  const expectedGuests = summary?.expectedGuests ?? event.expectedGuests;
  const group = isAccessError(groups.error)
    ? undefined
    : groups.data?.find((item) => item.id === event.groupId);
  return (
    <article>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 pl-5">
          <h1
            aria-label={event.name}
            className="text-2xl leading-[1.2] font-bold break-words"
          >
            <button
              type="button"
              aria-label="행사 수정"
              className="cursor-pointer text-left"
              onClick={() => setEditing(true)}
            >
              {event.name}
            </button>
          </h1>
          <p className="mt-2.5 text-xs leading-[1.2] text-placeholder break-words">
            {event.groupId ? (group?.name ?? "모임") : "개인 행사"}
          </p>
        </div>
        <div className="flex max-w-[48%] shrink-0 flex-col items-end gap-1 py-3 text-right text-xs leading-[1.2]">
          <span className="flex min-h-[18px] items-center justify-end gap-2">
            {expectedGuests != null
              ? `예상 ${expectedGuests}명`
              : summary?.hasAttendanceRecords
                ? `참석 ${summary.attendingCount}명`
                : summary?.participantCount
                  ? `명단 ${summary.participantCount}명`
                  : summary
                    ? "인원 미정"
                    : summaries.isError
                      ? "인원 확인 불가"
                      : "인원 확인 중"}
            <Image
              src="/images/calendar/guests.svg"
              alt=""
              width={18}
              height={18}
              className="shrink-0"
            />
          </span>
          <span className="flex min-h-[18px] items-center justify-end gap-2">
            {compactEventDate(event.scheduledAt)}
            <Image
              src="/images/home/calendar.svg"
              alt=""
              width={18}
              height={18}
              className="shrink-0"
            />
          </span>
          <span className="flex min-h-[18px] items-center justify-end gap-2 break-words">
            {summary
              ? (summary.region ?? "장소 정하는 중")
              : summaries.isError
                ? "장소 확인 불가"
                : "장소 확인 중"}
            <Image
              src="/images/calendar/location.svg"
              alt=""
              width={18}
              height={18}
              className="shrink-0"
            />
          </span>
        </div>
      </div>
      {editing && (
        <EditEvent
          event={event}
          accountId={accountId}
          request={request}
          onClose={() => setEditing(false)}
        />
      )}
      {detail.isError && (
        <ErrorState retry={() => void detail.refetch()}>
          최신 행사 정보를 불러오지 못했어요.
        </ErrorState>
      )}
      {summaries.isError && (
        <ErrorState retry={() => void summaries.refetch()}>
          행사 요약을 불러오지 못했어요.
        </ErrorState>
      )}
    </article>
  );
}
