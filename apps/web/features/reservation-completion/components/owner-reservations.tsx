"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Account, SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { buttonStyles } from "@/shared/ui/button";
import { ownerReservationsQuery } from "../api/completion.api";
import { CompletionWorkspace } from "./completion-workspace";
import { progressLabels } from "../lib/progress-labels";
export function OwnerReservations({
  account,
  request,
  reservationId,
}: {
  account: Account;
  request: SessionRequest;
  reservationId?: string;
}) {
  const list = useQuery({
    ...ownerReservationsQuery(account.id, request),
    enabled: !reservationId,
  });
  return (
    <main className="mx-auto min-h-svh max-w-[402px] px-5 pt-8 pb-[max(32px,env(safe-area-inset-bottom))]">
      <Link
        href={reservationId ? "/owner/reservations" : "/owner"}
        className="inline-flex min-h-11 items-center text-sm underline"
      >
        {reservationId ? "예약 목록" : "내 매장"}
      </Link>
      {reservationId ? (
        <CompletionWorkspace
          key={reservationId}
          id={reservationId}
          access={{ kind: "owner", accountId: account.id, request }}
        />
      ) : (
        <>
          <h1 className="my-6 text-2xl font-bold">선택된 예약 관리</h1>
          {list.isError ? (
            <ErrorState retry={() => void list.refetch()} />
          ) : !list.data ? (
            <LoadingState>예약 확인 중…</LoadingState>
          ) : !list.data.length ? (
            <p>선택된 예약이 아직 없어요.</p>
          ) : (
            <ul className="space-y-4">
              {list.data.map((q) => (
                <li
                  key={q.id}
                  className="space-y-3 rounded-control bg-surface p-5 shadow-card"
                >
                  <h2 className="font-semibold">{q.eventName}</h2>
                  <p className="text-sm">
                    {q.restaurantName} · {q.agreement.expectedGuests}명
                  </p>
                  <p className="text-sm">{progressLabels[q.progress]}</p>
                  <Link
                    className={buttonStyles({ variant: "outline" })}
                    href={`/owner/reservations?reservation=${q.id}`}
                  >
                    예약 확인
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
