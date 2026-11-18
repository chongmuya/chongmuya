"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Account, SessionRequest } from "@/features/auth/types";
import { ReplyWorkspace } from "@/features/merchant-replies/client";
import type { Reply } from "@/features/merchant-replies/types";
import { StepLayout } from "@/shared/ui/step-layout";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { buttonStyles } from "@/shared/ui/button";
import { ownerQuery } from "../api/owner.api";
type InquiryList = {
  inquiries: {
    targetId: string;
    restaurantName: string;
    eventName: string;
    startsAt: string;
    expectedGuests: number;
    response: Reply | null;
    closed: boolean;
  }[];
};
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
  const q = useQuery({
    ...ownerQuery<InquiryList>(account.id, "inquiries", request),
    enabled: !targetId,
  });
  return (
    <StepLayout
      title="받은 문의"
      onBack={() => onNavigate(targetId ? "/owner/inquiries" : "/owner")}
    >
      {targetId ? (
        <ReplyWorkspace
          targetId={targetId}
          access={{ kind: "owner", accountId: account.id, request }}
        />
      ) : q.isError ? (
        <ErrorState retry={() => void q.refetch()} />
      ) : !q.data ? (
        <LoadingState>문의 불러오는 중…</LoadingState>
      ) : (
        <>
          <h1 className="mb-6 text-2xl font-bold">받은 예약 문의</h1>
          {!q.data.inquiries.length && <p>아직 받은 문의가 없어요.</p>}
          <ul className="space-y-4">
            {q.data.inquiries.map((i) => (
              <li
                className="space-y-3 rounded-control bg-surface p-5 shadow-card"
                key={i.targetId}
              >
                <h2 className="font-bold">{i.eventName}</h2>
                <p className="text-sm">
                  {i.restaurantName} · {i.expectedGuests}명<br />
                  {new Date(i.startsAt).toLocaleString("ko-KR")}
                </p>
                <p className="text-sm text-brand">
                  {i.closed
                    ? "문의 종료"
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
                    문의 확인·답변
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </StepLayout>
  );
}
