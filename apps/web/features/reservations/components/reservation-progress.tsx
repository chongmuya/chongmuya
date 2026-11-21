"use client";
import {
  CompletionSteps,
  CompletionWorkspace,
} from "@/features/reservation-completion/client";
import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { Button, buttonStyles } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { inquiryQuery, inquiryKey } from "../api/reservations.api";
import { useReservationDecision } from "../hooks/use-reservation-decision";
import { ConditionSummary } from "./condition-summary";
import { InquiryNotice } from "./inquiry-notice";
import { ProposalCard, candidateLabels } from "./proposal-card";
import { RebookingCard } from "./rebooking-card";
import type {
  InquiryConditions,
  ReservationRequest,
} from "../types/inquiry.types";

type Target = ReservationRequest["targets"][number];
function InquiryReceipt({
  inquiry: q,
  onDecide,
  busy = false,
}: {
  inquiry: ReservationRequest;
  onDecide?: (action: "select" | "decline", target: Target) => void;
  busy?: boolean;
}) {
  const [sentRequestOpen, setSentRequestOpen] = useState(false);
  const sentRequestTitle = useId();
  const comparing = !q.selection && !q.canReinquire;
  const available = q.targets.filter((t) => t.canSelect).length,
    waiting = q.targets.filter(
      (t) =>
        !t.response &&
        (!t.candidateState || t.candidateState === "AWAITING_REPLY"),
    ).length;
  const selected = q.targets.find((t) => t.id === q.selection?.targetId);
  const reinquire = `/restaurants?event=${q.eventId}&inquiry=1&reinquire=${q.id}`;
  return (
    <section className="my-6 space-y-5 text-copy">
      {!q.selection && (
        <div className="pb-9">
          <CompletionSteps current={1} />
        </div>
      )}
      <header className="flex items-center justify-between gap-3">
        {comparing && (
          <div className="min-w-0">
            <h2 className="text-base leading-tight font-medium break-keep">
              답변이 도착한 매장을 확인해요
            </h2>
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              예약 가능 {available}곳 · 응답 대기 {waiting}곳
            </p>
          </div>
        )}
        <Button
          variant="outline"
          className="ml-auto min-h-[45px] shrink-0 gap-2 rounded-control border-placeholder px-3 py-2 text-sm leading-tight text-muted"
          aria-haspopup="dialog"
          onClick={() => setSentRequestOpen(true)}
        >
          <Image
            src="/images/reservations/sent-request.svg"
            alt=""
            width={15}
            height={20}
          />
          보낸 요청 보기
        </Button>
      </header>
      {q.selection ? (
        <div className="space-y-4 rounded-card bg-surface p-6 shadow-card">
          <p className="text-xs text-brand">매장 선택 당시 응답</p>
          <h2 className="text-xl font-bold">{selected?.restaurantName}</h2>
          {q.selection.snapshot.offered && (
            <ConditionSummary
              conditions={{ ...q.snapshot, ...q.selection.snapshot.offered }}
            />
          )}
          <p className="text-sm">
            선택 당시 조건을 보존한 이력이에요. 현재 메뉴·입금·확정 상태는 예약
            관리에서 확인해 주세요.
          </p>
        </div>
      ) : q.canReinquire ? (
        <div className="rounded-card bg-surface px-5 py-10 shadow-card">
          <Image
            src="/images/reservations/empty-store.svg"
            alt=""
            width={48}
            height={45}
            className="mx-auto mb-6"
          />
          <h2 className="text-center text-xl font-bold">
            지금 예약 가능한 매장이 없어요
          </h2>
          <p className="mt-4 text-center text-xs">
            이전 문의는 그대로 보존해요.
            <br />
            다른 매장을 찾거나 날짜·인원을 바꿔 다시 문의할 수 있어요.
          </p>
          <ul className="my-7 divide-y divide-border px-4">
            {q.targets.map((t) => (
              <li key={t.id} className="py-4">
                <strong className="text-lg">{t.restaurantName}</strong>
                <p className="mt-1 text-xs text-muted">
                  {candidateLabels[t.candidateState ?? ""] ?? "문의 종료"}
                  {t.response?.kind === "DECLINE"
                    ? ` · ${t.response.reason}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
          <Link
            href={`${reinquire}&view=list`}
            className={buttonStyles({ className: "w-full" })}
          >
            다른 매장 찾기
          </Link>
          <Link
            href={`${reinquire}&view=conditions`}
            className="mt-4 block text-center text-sm text-muted underline"
          >
            날짜·인원 수정하기
          </Link>
        </div>
      ) : (
        <InquiryNotice>
          <p>모든 답변을 기다리지 않아도 괜찮아요.</p>
          <p>한 곳을 선택하면 다른 매장의 문의는 종료돼요.</p>
        </InquiryNotice>
      )}
      {q.canReinquire || q.selection ? (
        <>
          {selected && (
            <ul>
              <ProposalCard target={selected} busy={busy} />
            </ul>
          )}
          <details className="rounded-control bg-surface p-5 text-sm shadow-card">
            <summary className="cursor-pointer font-semibold">
              이전 후보·답변 보기
            </summary>
            <ul className="mt-5 space-y-5">
              {q.targets
                .filter((t) => t.id !== selected?.id)
                .map((t) => (
                  <ProposalCard key={t.id} target={t} busy={busy} />
                ))}
            </ul>
          </details>
        </>
      ) : (
        <ul className="space-y-5">
          {q.targets
            .toSorted((a, b) => Number(!!b.canSelect) - Number(!!a.canSelect))
            .map((t) => (
              <ProposalCard
                key={t.id}
                target={t}
                onDecide={onDecide}
                busy={busy}
              />
            ))}
        </ul>
      )}
      {sentRequestOpen && (
        <Dialog
          labelledBy={sentRequestTitle}
          onClose={() => setSentRequestOpen(false)}
          showCloseButton
          dismissOnBackdrop
          className="space-y-4 text-sm text-copy"
        >
          <h2 id={sentRequestTitle} className="text-xl font-semibold">
            보낸 예약 문의
          </h2>
          <SentInquiryContent inquiry={q} />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSentRequestOpen(false)}
          >
            확인
          </Button>
        </Dialog>
      )}
      {!!q.notifications?.length && (
        <details className="text-xs">
          <summary className="cursor-pointer">안내 문자 전달 상태</summary>
          <ul className="mt-3 space-y-2">
            {q.notifications.map((n) => (
              <li key={n.id}>
                {n.recipientKind === "ORGANIZER" ? "총무 안내" : "매장 안내"} ·{" "}
                {(
                  {
                    PENDING: "발송 대기",
                    PROCESSING: "발송 중",
                    ACCEPTED: "발송 접수",
                    DELIVERED: "전달 완료",
                    FAILED: "전달 실패 · 운영 확인 필요",
                    UNKNOWN: "접수 확인 필요 · 자동 재발송하지 않아요",
                    HELD: "발송 보류",
                  } as Record<string, string>
                )[n.status] ?? n.status}
                {n.provider === "fake" ? " (체험)" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SentInquiryContent({ inquiry }: { inquiry: ReservationRequest }) {
  return (
    <div className="text-sm">
      <ConditionSummary conditions={inquiry.snapshot} />
      <InquiryDetails
        conditions={inquiry.snapshot}
        contact={{
          name: inquiry.contact.name,
          phone: inquiry.contact.maskedPhone,
        }}
      />
    </div>
  );
}

export function DecisionReceipt({
  inquiry,
  accountId,
  request,
  showEventLink = false,
}: {
  inquiry: ReservationRequest;
  accountId: string;
  request: SessionRequest;
  showEventLink?: boolean;
}) {
  const [decision, setDecision] = useState<{
    action: "select" | "decline";
    target: Target;
    requestKey: string;
    expectedVersion: number;
  } | null>(null);
  const action = useReservationDecision(
      accountId,
      inquiry.eventId,
      inquiry.id,
      request,
    ),
    active = useActiveScreen();
  return (
    <>
      {showEventLink && (
        <h1 className="mt-6 text-2xl font-bold wrap-break-word">
          {inquiry.snapshot.eventName}
        </h1>
      )}
      <FormError
        message={action.error ? safeErrorMessage(action.error) : undefined}
      />
      {inquiry.selection && (
        <CompletionWorkspace
          id={inquiry.selection.id}
          access={{ kind: "organizer", accountId, request }}
          inquiryContent={<InquiryReceipt inquiry={inquiry} />}
          sentInquiryContent={<SentInquiryContent inquiry={inquiry} />}
        />
      )}
      {!inquiry.selection && (
        <InquiryReceipt
          inquiry={inquiry}
          busy={action.isPending}
          onDecide={(kind, target) => {
            action.reset();
            setDecision({
              action: kind,
              target,
              requestKey: crypto.randomUUID(),
              expectedVersion: inquiry.version!,
            });
          }}
        />
      )}
      {decision && inquiry.lifecycle !== "SELECTED" && (
        <Dialog
          labelledBy="reservation-decision"
          busy={action.isPending}
          onClose={() => setDecision(null)}
        >
          <h2 id="reservation-decision" className="text-xl font-bold">
            {decision.target.restaurantName}
            {decision.action === "select"
              ? "을 선택할까요?"
              : " 제안을 거절할까요?"}
          </h2>
          <p className="my-5 text-sm">
            {decision.action === "select"
              ? "이 제안을 수락하면 다른 매장의 문의와 제안이 종료돼요. 메뉴 전달과 필요한 실제 입금 확인 전에는 예약이 확정되지 않아요."
              : "총무의 불가 결정으로 이 후보를 종료해요. 매장이 보낸 답변은 이력으로 남아요."}
          </p>
          <FormError
            message={action.error ? safeErrorMessage(action.error) : undefined}
          />
          <div className="mt-5 flex gap-3">
            <Button
              className="flex-1"
              variant="outline"
              disabled={action.isPending}
              onClick={() => setDecision(null)}
            >
              돌아가기
            </Button>
            <Button
              className="flex-1"
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  {
                    action: decision.action,
                    targetId: decision.target.id,
                    revision: decision.target.response!.revision,
                    expectedVersion: decision.expectedVersion,
                    requestKey: decision.requestKey,
                  },
                  {
                    onSuccess: () => {
                      if (active.current) setDecision(null);
                    },
                  },
                )
              }
            >
              {decision.action === "select" ? "이 매장 선택" : "불가 결정"}
            </Button>
          </div>
        </Dialog>
      )}
      {showEventLink && (
        <Link
          className={buttonStyles({ variant: "outline", className: "w-full" })}
          href={`/events?event=${inquiry.eventId}`}
        >
          행사로 돌아가기
        </Link>
      )}
    </>
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
  const params = useSearchParams();
  const router = useRouter();
  const requested = params?.get("request");
  const historyId =
    requested &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requested,
    )
      ? requested
      : null;
  const showRequest = (id: string | null) => {
    const next = new URLSearchParams(params?.toString());
    next.set("event", eventId);
    if (id) next.set("request", id);
    else next.delete("request");
    router.replace(`/events?${next}`);
  };
  const current = useQuery({
    ...inquiryQuery(accountId, eventId, request),
    refetchInterval: 15000,
  });
  const history = useQuery({
    queryKey: [...inquiryKey(accountId, eventId), "history", historyId],
    queryFn: ({ signal }) =>
      request<ReservationRequest>(
        `/api/v1/events/${eventId}/reservation-requests/${historyId}`,
        { signal },
      ),
    enabled: !!historyId,
    staleTime: 0,
    retry: false,
  });
  const separateRound = historyId && historyId !== current.data?.id;
  const result = separateRound ? history : current;
  if (isAccessError(current.error) || isAccessError(result.error))
    return (
      <ErrorState retry={() => void result.refetch()}>
        이 문의에 접근할 수 없어요.
      </ErrorState>
    );
  if (result.isError && !result.data)
    return (
      <ErrorState retry={() => void result.refetch()}>
        문의 진행 상태를 확인하지 못했어요.
      </ErrorState>
    );
  if (result.data === undefined)
    return <LoadingState>문의 확인 중…</LoadingState>;
  if (!result.data)
    return (
      <div className="my-6 space-y-6">
        <section className="rounded-control bg-surface px-5 py-10 text-center shadow-card">
          <Image
            src="/images/reservations/change-calendar.svg"
            alt=""
            width={48}
            height={49}
            loading="eager"
            className="mx-auto mb-5"
          />
          <h2 className="text-xl font-bold break-keep">
            아직 보낸 예약 문의가 없어요
          </h2>
          <p className="mt-3 text-sm text-muted">
            참석 확인과 정산부터 시작할 수 있어요.
          </p>
          <Link
            href={`/events?event=${eventId}&view=attendance`}
            className={buttonStyles({ className: "mt-5 rounded-control" })}
          >
            참석 관리하기 <span aria-hidden="true">→</span>
          </Link>
        </section>
        <section className="rounded-control bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold">나중에 예약이 필요해지면?</h2>
          <p className="mt-2 mb-4 text-xs text-muted">
            원하는 조건을 입력해 최대 3곳에 한 번에 문의할 수 있어요.
          </p>
          <Link
            href={`/restaurants?event=${eventId}&inquiry=1`}
            className={buttonStyles({
              variant: "outline",
              className: "w-full",
            })}
          >
            예약 준비 시작하기
          </Link>
        </section>
      </div>
    );
  const inquiry = result.data;
  return (
    <>
      {result.isError && (
        <ErrorState retry={() => void result.refetch()}>
          최신 문의 상태를 불러오지 못했어요. 다시 확인해 주세요.
        </ErrorState>
      )}
      {historyId &&
        (!separateRound || (current.data?.history?.length ?? 0) <= 1) && (
          <Button
            variant="outline"
            className="mb-5"
            onClick={() => showRequest(null)}
          >
            현재 예약 화면으로
          </Button>
        )}
      {(!historyId || separateRound) &&
        (current.data?.history?.length ?? 0) > 1 && (
          <label className="block text-sm">
            문의 회차{" "}
            <select
              className="min-h-11 rounded-control border border-field px-3"
              value={historyId ?? ""}
              onChange={(e) => showRequest(e.target.value || null)}
            >
              <option value="">현재 회차</option>
              {current
                .data!.history!.filter((r) => r.id !== current.data!.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.round}회차 · 이전 문의
                  </option>
                ))}
            </select>
          </label>
        )}
      {!historyId &&
      inquiry.selection?.status === "CANCELLED" &&
      inquiry.canReinquire ? (
        <RebookingCard
          inquiry={inquiry}
          onHistory={() => showRequest(inquiry.id)}
        />
      ) : (
        <DecisionReceipt
          key={`${accountId}:${eventId}:${inquiry.id}`}
          inquiry={inquiry}
          accountId={accountId}
          request={request}
        />
      )}
    </>
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
