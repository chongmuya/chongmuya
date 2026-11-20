"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { isAccessError } from "@/shared/http/access-error";
import { ErrorState } from "@/shared/ui/states";
import { calendarQuery } from "../api/calendar.api";
import { ReservationFacts } from "./reservation-facts";
import { kstDate } from "../lib/dates";
export function MerchantSummary({
  accountId,
  restaurantId,
  request,
}: {
  accountId: string;
  restaurantId: string;
  request: SessionRequest;
}) {
  const q = useQuery(
    calendarQuery(
      accountId,
      request,
      kstDate().slice(0, 7),
      undefined,
      restaurantId,
    ),
  );
  const rows = isAccessError(q.error) ? undefined : q.data?.reservations;
  return (
    <section className="space-y-3">
      {q.isError && <ErrorState retry={() => void q.refetch()} />}{" "}
      {rows && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">
              우리 매장 문의·예약{" "}
              <span className="ml-2 text-sm text-brand-action">
                {rows.length}
              </span>
            </h3>
            <Link
              href={`/calendar?restaurant=${restaurantId}`}
              aria-label="이번 달 문의·예약 전체 보기"
            >
              전체 보기 ›
            </Link>
          </div>
          {!rows.length && (
            <p className="rounded-card bg-surface p-5 text-sm text-secondary">
              이번 달 문의·예약이 아직 없어요.
            </p>
          )}
          {rows.slice(0, 5).map((r) => (
            <Link
              className="block rounded-card bg-surface p-5 text-sm shadow-card"
              href={r.destination}
              key={r.id}
            >
              {new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(r.startsAt))}{" "}
              · {r.title}
              <span className="mt-1 block text-brand-action">
                {r.status === "CONFIRMED"
                  ? "확정"
                  : r.status === "CANCELLED"
                    ? "취소"
                    : r.status === "PREPARING"
                      ? "선택됨 · 메뉴·입금 확인"
                      : r.status === "CHECK_REQUIRED"
                        ? "확인 필요"
                        : "문의·제안 상태 확인"}
              </span>
              <ReservationFacts reservation={r} />
            </Link>
          ))}
        </>
      )}
    </section>
  );
}
