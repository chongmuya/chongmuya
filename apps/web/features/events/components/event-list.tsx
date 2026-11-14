"use client";

import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { dateLabel } from "../lib/format-event-date";

type Props = { accountId: string; groupId?: string; request: SessionRequest };

import Link from "next/link";
import { EmptyState } from "@/shared/ui/states";
import { eventsQueryOptions } from "../api/events.queries";
import { EventForm } from "./event-form";

export function EventList(props: Props) {
  const list = useQuery(
    eventsQueryOptions(props.accountId, props.request, props.groupId),
  );
  return (
    <>
      <EventForm {...props} />
      <h2>{props.groupId ? "모임별 내 행사" : "내 행사 목록"}</h2>
      {props.groupId && <Link href="/events">전체 내 행사 보기</Link>}
      {list.isError ? (
        <ErrorState retry={() => void list.refetch()} />
      ) : !list.data ? (
        <LoadingState>행사 불러오는 중…</LoadingState>
      ) : !list.data.length ? (
        <EmptyState>
          아직 행사가 없어요. 행사명만 입력해 첫 행사를 만들어 보세요.
        </EmptyState>
      ) : (
        <ul>
          {list.data.map((event) => (
            <li key={event.id}>
              <Link href={`/events?event=${encodeURIComponent(event.id)}`}>
                {event.name}
              </Link>
              <p>{dateLabel(event.scheduledAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
