"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Account, SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { buttonStyles } from "@/shared/ui/button";
import { ownerReservationsQuery } from "../api/completion.api";
import { CompletionWorkspace } from "./completion-workspace";
import { merchantNextStep } from "../lib/merchant-next-step";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { StepLayout } from "@/shared/ui/step-layout";
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
    <StepLayout
      title={reservationId ? "예약 상세" : "예약 관리"}
      onBack={() =>
        router.push(reservationId ? "/owner/reservations" : "/owner")
      }
    >
      {reservationId ? (
        <CompletionWorkspace
          key={reservationId}
          id={reservationId}
          access={{ kind: "owner", accountId: account.id, request }}
        />
      ) : (
        <>
          <h1 className="sr-only">예약 관리</h1>
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
                  <h2 className="font-semibold wrap-break-word">
                    {q.eventName}
                  </h2>
                  <p className="text-sm">
                    {q.restaurantName} · {q.agreement.expectedGuests}명<br />
                    {koreanDateLabel(q.agreement.startsAt)}
                  </p>
                  <p className="text-sm font-medium text-brand-ink">
                    {merchantNextStep(q).status}
                  </p>
                  <Link
                    className={buttonStyles({
                      variant: "outline",
                    })}
                    href={`/owner/reservations?reservation=${q.id}`}
                  >
                    예약 보기
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </StepLayout>
  );
}
