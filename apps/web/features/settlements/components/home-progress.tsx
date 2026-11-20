"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Access } from "../types/settlement.types";
import { settlementQuery } from "../api/settlement.api";
import { isAccessError } from "@/shared/http/access-error";
import { ErrorState } from "@/shared/ui/states";
export function HomeProgress(props: Access) {
  const q = useQuery(settlementQuery(props));
  const d = isAccessError(q.error) ? undefined : q.data;
  return (
    <div className="px-5 py-3 text-sm">
      {q.isError && (
        <ErrorState retry={() => void q.refetch()}>
          진행 상태를 확인하지 못했어요.
        </ErrorState>
      )}
      {d?.facts && d?.summary && (
        <>
          <p>
            참석 {d.facts.attendingCount}명 · 예약{" "}
            {d.reservations.some((r) => r.status === "CONFIRMED")
              ? "확정"
              : d.reservations.some((r) => r.status !== "CANCELLED")
                ? "준비 중"
                : "선택 대기"}
          </p>
          <p>
            정산{" "}
            {d.summary.status === "COMPLETE"
              ? "완료"
              : d.summary.status === "EMPTY"
                ? "입력 전"
                : `확인 필요 ${d.summary.unconfirmed}명`}
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            <Link
              className="underline"
              href={`/events?event=${props.eventId}&view=attendance`}
            >
              참석 확인
            </Link>
            <Link className="underline" href={`/events?event=${props.eventId}`}>
              예약 진행
            </Link>
            <Link
              className="underline"
              href={`/events?event=${props.eventId}&view=settlement`}
            >
              {d.summary.status === "EMPTY" ? "지출 입력" : "정산 확인"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
