"use client";
import { reservationLabel } from "../lib/reservation-label";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { isAccessError } from "@/shared/http/access-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { Calendar } from "@/shared/ui/calendar";
import { calendarQuery } from "../api/calendar.api";
import { ReservationFacts } from "./reservation-facts";
import { koreanDateOnly } from "@/shared/lib/korean-date";
import { usePageVisible } from "@/shared/hooks/use-page-visible";
export function MerchantSummary({
  accountId,
  restaurantId,
  request,
}: {
  accountId: string;
  restaurantId: string;
  request: SessionRequest;
}) {
  const today = koreanDateOnly();
  const visible = usePageVisible();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const q = useQuery(
    calendarQuery(accountId, request, month, undefined, restaurantId, visible),
  );
  const rows = isAccessError(q.error) ? undefined : q.data?.reservations;
  const selectedRows = rows
    ?.filter((r) => koreanDateOnly(new Date(r.startsAt)) === selected)
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
    );
  return (
    <section aria-label="우리 매장 예약 달력">
      {q.isError && <ErrorState retry={() => void q.refetch()} />}
      {q.isPending && <LoadingState>예약을 확인하고 있어요…</LoadingState>}
      <Calendar
        showYear={false}
        value={selected}
        month={month}
        markedDates={
          rows?.map((r) => koreanDateOnly(new Date(r.startsAt))) ?? []
        }
        onMonthChange={(value) => {
          setMonth(value);
          setSelected(`${value}-01`);
        }}
        onChange={(value) => {
          setSelected(value);
          setMonth(value.slice(0, 7));
        }}
      />
      {selectedRows && (
        <>
          <div className="mt-[18px] mb-3.5 flex min-h-11 items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">
              {new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date(`${selected}T00:00:00+09:00`))}
              <span className="ml-2 text-sm text-brand-action">
                {selectedRows.length}
              </span>
            </h2>
            <Link
              href={`/calendar?restaurant=${restaurantId}`}
              className="shrink-0 text-sm text-secondary"
              aria-label="예약 관리 열기"
            >
              예약 관리 ›
            </Link>
          </div>
          {!selectedRows.length && (
            <p className="py-8 text-center text-sm text-secondary">
              선택한 날짜에 문의·예약이 없어요.
            </p>
          )}
          <div className="space-y-3.5">
            {selectedRows.map((r) => (
              <Link
                className="block rounded-card bg-surface px-7 py-4 shadow-card"
                href={r.destination}
                key={r.id}
              >
                <p className="text-base font-medium text-brand-action">
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "numeric",
                    day: "numeric",
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date(r.startsAt))}
                </p>
                <strong className="mt-2 block text-base font-medium break-words">
                  {r.title}
                </strong>
                <span className="mt-2 block text-xs text-secondary">
                  {reservationLabel(r)}
                </span>
                <ReservationFacts reservation={r} />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
