"use client";
import { ReplySummary } from "@/features/merchant-replies/client";
import { ConditionSummary } from "./condition-summary";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { inquiryQuery } from "../api/reservations.api";
import type {
  InquiryConditions,
  ReservationRequest,
} from "../types/inquiry.types";

export function InquiryReceipt({
  inquiry,
  showEventLink = false,
}: {
  inquiry: ReservationRequest;
  showEventLink?: boolean;
}) {
  const c = inquiry.snapshot;
  return (
    <section className="my-6 space-y-7 text-copy">
      <header>
        {showEventLink && (
          <h1 className="mb-4 text-2xl font-bold">{c.eventName}</h1>
        )}
        <p className="text-xs text-secondary">문의 접수 완료</p>
        <h2 className="mt-1 text-xl font-bold">
          매장 답변{" "}
          <span className="text-brand-action">
            {inquiry.responseCount}/{inquiry.targets.length}
          </span>
        </h2>
        <p className="mt-2 text-sm text-secondary">
          {inquiry.responseCount
            ? `가능·변경 제안 ${inquiry.proposalCount ?? 0}건 · 불가 ${inquiry.declineCount ?? 0}건`
            : "아직 매장 답변이 없어요."}
        </p>
      </header>
      <ul className="space-y-3">
        {inquiry.targets.map((t) => (
          <li key={t.id} className="rounded-control bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{t.restaurantName}</strong>
              <span className="shrink-0 rounded-pill bg-brand/10 px-2 py-1 text-xs text-brand-action">
                {
                  {
                    PENDING: "발송 대기",
                    PROCESSING: "발송 요청 중",
                    ACCEPTED:
                      t.delivery?.provider === "fake"
                        ? "체험 발송 접수"
                        : "발송 접수",
                    DELIVERED:
                      t.delivery?.provider === "fake"
                        ? "체험 발송"
                        : "전달 완료",
                    FAILED: "전달 실패",
                    UNKNOWN: "접수 확인 필요",
                    HELD: "발송 보류",
                    CANCELLED: "발송 중단",
                  }[t.deliveryStatus]
                }
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">{t.address}</p>
            {t.response && <ReplySummary response={t.response} />}
          </li>
        ))}
      </ul>
      <details className="rounded-control bg-surface p-5 text-sm shadow-card">
        <summary className="cursor-pointer font-semibold">
          접수한 조건 확인
        </summary>
        <div className="mt-4">
          <ConditionSummary conditions={c} />
        </div>
        <InquiryDetails
          conditions={c}
          contact={{
            name: inquiry.contact.name,
            phone: inquiry.contact.maskedPhone,
          }}
        />
      </details>
      {showEventLink && (
        <Link
          className={buttonStyles({ variant: "outline", className: "w-full" })}
          href={`/events?event=${inquiry.eventId}`}
        >
          행사로 돌아가기
        </Link>
      )}
    </section>
  );
}
export function ReservationProgress({
  accountId,
  eventId,
  request,
}: {
  accountId: string;
  eventId: string;
  request: SessionRequest;
}) {
  const result = useQuery({
    ...inquiryQuery(accountId, eventId, request),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  if (result.isError && result.data === undefined)
    return (
      <ErrorState retry={() => void result.refetch()}>
        문의 진행 상태를 확인하지 못했어요.
      </ErrorState>
    );
  if (result.data === undefined)
    return <LoadingState>문의 확인 중…</LoadingState>;
  return result.data ? (
    <>
      {result.isError && (
        <ErrorState retry={() => void result.refetch()}>
          최신 문의 상태를 불러오지 못했어요.
        </ErrorState>
      )}
      <InquiryReceipt inquiry={result.data} />
    </>
  ) : (
    <section className="my-6 rounded-control bg-surface p-5 shadow-card">
      <h2 className="text-xl font-bold">장소도 함께 알아볼까요?</h2>
      <p className="my-3 text-sm text-muted">
        모임이나 명단 없이도 1~3곳에 예약 조건을 문의할 수 있어요.
      </p>
      <Link
        href={`/restaurants?event=${eventId}&inquiry=1`}
        className={buttonStyles({ className: "w-full" })}
      >
        예약 조건 입력 · 매장 찾기
      </Link>
    </section>
  );
}

export function InquiryDetails({
  conditions: c,
  contact,
}: {
  conditions: InquiryConditions;
  contact: { name: string; phone: string };
}) {
  return (
    <dl className="mt-3 space-y-3">
      <div>
        <dt>함께 착석</dt>
        <dd>
          {
            {
              CLOSE: "같은 공간에서 가까이",
              SEPARATED: "떨어져도 가능",
              ANY: "상관없음",
            }[c.seating]
          }
          {c.seatingImportance &&
            ` · ${c.seatingImportance === "REQUIRED" ? "꼭 필요" : "가능하면 희망"}`}
        </dd>
      </div>
      <div>
        <dt>공간 이용</dt>
        <dd>
          {
            {
              HALL: "일반 홀",
              ROOM: "별도 룸",
              FLOOR: "한 층 단독 대관",
              WHOLE: "전체 단독 대관",
              ANY: "상관없음",
            }[c.space]
          }
          {c.spaceImportance &&
            ` · ${c.spaceImportance === "REQUIRED" ? "꼭 필요" : "가능하면 희망"}`}
        </dd>
      </div>
      {c.budgetAmount !== null && (
        <div>
          <dt>예산</dt>
          <dd>
            {`${c.budgetBasis === "PER_PERSON" ? "1인당" : "전체"} ${c.budgetAmount.toLocaleString()}원 · 주류 ${c.alcohol === "INCLUDED" ? "포함" : c.alcohol === "EXCLUDED" ? "미포함" : "미정"}`}
          </dd>
        </div>
      )}
      {c.additionalRequests && (
        <div>
          <dt>요청사항</dt>
          <dd className="whitespace-pre-wrap wrap-break-word">
            {c.additionalRequests}
          </dd>
        </div>
      )}
      <div>
        <dt>담당자</dt>
        <dd>
          {contact.name} · {contact.phone}
        </dd>
      </div>
    </dl>
  );
}
