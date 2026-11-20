"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const list = useQuery({
    ...ownerReservationsQuery(account.id, request),
    enabled: !reservationId,
  });
  return (
    <main className="mx-auto min-h-svh max-w-[402px] bg-surface px-5 pb-7 text-copy">
      <header className="flex items-center gap-2 pt-[18px] pb-2.5">
        <button
          type="button"
          aria-label="이전 화면으로 돌아가기"
          className="relative flex h-8 w-[10px] items-center justify-center text-[22px] before:absolute before:-inset-x-4 before:-inset-y-1.5"
          onClick={() =>
            router.push(reservationId ? "/owner/reservations" : "/owner")
          }
        >
          ‹
        </button>
        <p className="text-base font-semibold">
          {reservationId ? "예약 상세" : "선택된 예약 관리"}
        </p>
      </header>
      {reservationId ? (
        <CompletionWorkspace
          key={reservationId}
          id={reservationId}
          access={{ kind: "owner", accountId: account.id, request }}
        />
      ) : (
        <>
          <h1 className="sr-only">선택된 예약 관리</h1>
          {list.isError ? (
            <ErrorState retry={() => void list.refetch()} />
          ) : !list.data ? (
            <LoadingState>예약 확인 중…</LoadingState>
          ) : !list.data.length ? (
            <p className="py-10 text-center text-sm text-muted">
              선택된 예약이 아직 없어요.
            </p>
          ) : (
            <ul className="space-y-4">
              {list.data.map((q) => (
                <li
                  key={q.id}
                  className="space-y-3 rounded-card bg-surface p-4 shadow-card"
                >
                  <h2 className="font-semibold">{q.eventName}</h2>
                  <p className="text-sm">
                    {q.restaurantName} · {q.agreement.expectedGuests}명
                  </p>
                  <p className="text-sm">{progressLabels[q.progress]}</p>
                  <Link
                    className={buttonStyles({
                      variant: "outline",
                    })}
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
