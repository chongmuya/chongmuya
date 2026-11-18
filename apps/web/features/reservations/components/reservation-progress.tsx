"use client";
import { ConditionSummary } from "./condition-summary";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { Button, buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { inquiryQuery } from "../api/reservations.api";
import type { ReservationRequest } from "../types/inquiry.types";

export function InquiryReceipt({ inquiry }: { inquiry: ReservationRequest }) {
  const c = inquiry.snapshot;
  return (
    <section className="my-6 space-y-7 text-copy">
      <div className="rounded-control bg-surface px-5 py-7 text-center shadow-card">
        <p className="text-sm font-semibold text-brand">문의 접수 완료</p>
        <h2 className="mt-2 text-xl font-bold">매장 전달을 준비하고 있어요</h2>
        <p className="mt-2 text-sm text-muted">
          아직 문자를 발송하지 않았어요. 접수한 문의는 이 행사에서 다시 확인할
          수 있어요.
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-bold">{c.eventName}</h3>
        <p className="text-xs text-secondary">{c.groupName ?? "개인 행사"}</p>
        <ConditionSummary conditions={c} />
      </div>
      <ul className="space-y-3">
        {inquiry.targets.map((t) => (
          <li key={t.id} className="rounded-control bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{t.restaurantName}</strong>
              <span className="shrink-0 rounded-pill bg-brand/10 px-2 py-1 text-xs text-brand">
                전달 대기
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">{t.address}</p>
            {t.isDemo && (
              <p className="text-xs text-brand">
                개발용 가상 매장 · 실제 발송 안 함
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="rounded-control bg-surface px-5 py-7 text-center shadow-card">
        <h3 className="font-semibold">도착한 응답 {inquiry.responseCount}건</h3>
        <p className="mt-1 text-sm text-muted">
          아직 매장 응답이 없어요. 매장 응답·수락 기능은 준비 중이에요.
        </p>
      </div>
      <details className="rounded-control bg-surface p-5 text-sm shadow-card">
        <summary className="cursor-pointer font-semibold">
          접수한 조건 확인
        </summary>
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
                  FLOOR: "한 층 단독 대관",
                  WHOLE: "전체 단독 대관",
                  ANY: "상관없음",
                }[c.space]
              }
              {c.spaceImportance &&
                ` · ${c.spaceImportance === "REQUIRED" ? "꼭 필요" : "가능하면 희망"}`}
            </dd>
          </div>
          <div>
            <dt>예산</dt>
            <dd>
              {c.budgetAmount
                ? `${c.budgetBasis === "PER_PERSON" ? "1인당" : "전체"} ${c.budgetAmount.toLocaleString()}원 · 주류 ${c.alcohol === "INCLUDED" ? "포함" : c.alcohol === "EXCLUDED" ? "미포함" : "미정"}`
                : "입력하지 않음"}
            </dd>
          </div>
          <div>
            <dt>요청사항</dt>
            <dd className="whitespace-pre-wrap wrap-break-word">
              {c.additionalRequests || "없음"}
            </dd>
          </div>
          <div>
            <dt>담당자</dt>
            <dd>
              {inquiry.contact.name} · {inquiry.contact.maskedPhone}
            </dd>
          </div>
        </dl>
      </details>
      <p className="text-xs text-muted">
        접수 후 조건 수정·매장 추가·같은 행사 재문의는 할 수 없어요. 이후 행사
        정보를 바꿔도 보낸 조건은 그대로 보존됩니다.
      </p>
      <Link
        className={buttonStyles({ variant: "outline", className: "w-full" })}
        href={`/events?event=${inquiry.eventId}`}
      >
        행사로 돌아가기
      </Link>
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
  const result = useQuery(inquiryQuery(accountId, eventId, request));
  if (result.isError)
    return (
      <ErrorState retry={() => void result.refetch()}>
        문의 진행 상태를 확인하지 못했어요.
      </ErrorState>
    );
  if (result.data === undefined)
    return <LoadingState>문의 확인 중…</LoadingState>;
  return result.data ? (
    <>
      <InquiryReceipt inquiry={result.data} />
      <Button
        variant="outline"
        onClick={() => void result.refetch()}
        disabled={result.isFetching}
      >
        진행 상태 새로 확인
      </Button>
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
