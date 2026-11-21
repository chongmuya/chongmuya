"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Account, SessionRequest } from "@/features/auth/types";
import { ReplyWorkspace } from "@/features/merchant-replies/client";
import { StepLayout } from "@/shared/ui/step-layout";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { Button, buttonStyles } from "@/shared/ui/button";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import { inquiriesQuery } from "../api/owner.api";
export function OwnerInquiries({
  account,
  request,
  targetId,
  onNavigate,
}: {
  account: Account;
  request: SessionRequest;
  targetId?: string;
  onNavigate: (path: string) => void;
}) {
  const q = useInfiniteQuery({
    ...inquiriesQuery(account.id, request),
    enabled: !targetId,
  });
  if (targetId)
    return (
      <ReplyWorkspace
        key={targetId}
        targetId={targetId}
        onDone={() => onNavigate("/owner/inquiries")}
        access={{ kind: "owner", accountId: account.id, request }}
      />
    );
  return (
    <StepLayout title="받은 문의" onBack={() => onNavigate("/owner")}>
      <h1 className="sr-only">받은 문의</h1>
      {q.isError && !q.data ? (
        <ErrorState retry={() => void q.refetch()} />
      ) : !q.data ? (
        <LoadingState>문의 불러오는 중…</LoadingState>
      ) : (
        <>
          {q.isError && (
            <p role="alert">
              최근 문의를 불러오지 못했어요. 다시 불러와 주세요.
            </p>
          )}
          {!q.data.pages.flatMap((page) => page.inquiries).length && (
            <p>아직 받은 문의가 없어요.</p>
          )}
          <ul className="space-y-4">
            {q.data.pages
              .flatMap((page) => page.inquiries)
              .map((i) => (
                <li
                  className="space-y-3 rounded-control bg-surface p-5 shadow-card"
                  key={i.targetId}
                >
                  <h2 className="font-bold">{i.eventName}</h2>
                  <p className="text-sm">
                    {i.restaurantName} · {i.expectedGuests}명<br />
                    {koreanDateLabel(i.startsAt)}
                  </p>
                  <p className="text-sm text-brand">
                    {i.candidateState === "SELECTED"
                      ? "매장 선택됨"
                      : i.candidateState === "OTHER_SELECTED"
                        ? "다른 매장 선택됨"
                        : i.candidateState === "ORGANIZER_DECLINED"
                          ? "총무가 제안을 거절했어요"
                          : i.response?.kind === "DECLINE"
                            ? "불가 답변 완료"
                            : i.candidateState === "EXPIRED" ||
                                (!i.closed && i.response?.state === "EXPIRED")
                              ? "선택 기한 만료"
                              : i.closed
                                ? "문의 종료"
                                : i.response
                                  ? "총무 선택 대기"
                                  : "답변 대기"}
                  </p>
                  {i.reservationId && (
                    <Link
                      className={buttonStyles({ className: "w-full" })}
                      href={`/owner/reservations?reservation=${i.reservationId}`}
                    >
                      예약 관리
                    </Link>
                  )}
                  {(!i.closed || i.response) && (
                    <Link
                      className={buttonStyles({
                        variant: "outline",
                        className: "w-full",
                      })}
                      href={`/owner/inquiries?target=${i.targetId}`}
                    >
                      {i.response ? "보낸 답변 보기" : "문의 확인·답변"}
                    </Link>
                  )}
                </li>
              ))}
          </ul>
          {q.hasNextPage && (
            <Button
              variant="outline"
              className="mt-5 w-full"
              loading={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              문의 더 보기
            </Button>
          )}
        </>
      )}
    </StepLayout>
  );
}
