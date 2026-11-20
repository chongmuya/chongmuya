"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Account, SessionRequest } from "@/features/auth/types";
import { ReplyWorkspace } from "@/features/merchant-replies/client";
import { StepLayout } from "@/shared/ui/step-layout";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { Button, buttonStyles } from "@/shared/ui/button";
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
  return (
    <StepLayout
      title={targetId ? "받은 문의" : ""}
      onBack={() => onNavigate(targetId ? "/owner/inquiries" : "/owner")}
    >
      {targetId ? (
        <ReplyWorkspace
          targetId={targetId}
          onDone={() => onNavigate("/owner/inquiries")}
          access={{ kind: "owner", accountId: account.id, request }}
        />
      ) : q.isError && !q.data ? (
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
          <h1 className="mb-6 text-2xl font-bold">받은 예약 문의</h1>
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
                    {new Date(i.startsAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                  <p className="text-sm text-brand">
                    {i.closed
                      ? "문의 종료"
                      : i.response?.state === "EXPIRED"
                        ? "선택 기한 만료"
                        : i.response
                          ? {
                              AVAILABLE: "가능 제안",
                              CHANGE: "조건 변경 제안",
                              DECLINE: "불가",
                            }[i.response.kind]
                          : "답변 대기"}
                  </p>
                  {!i.closed && (
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
