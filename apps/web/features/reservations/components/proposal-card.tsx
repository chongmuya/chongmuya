import Link from "next/link";
import { RestaurantPhoto } from "@/features/restaurants/client";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import type { ReservationRequest } from "../types/inquiry.types";
export const candidateLabels: Record<string, string> = {
  AWAITING_REPLY: "응답 대기",
  PROPOSED: "선택 가능",
  MERCHANT_DECLINED: "매장 불가",
  ORGANIZER_DECLINED: "총무 불가",
  OTHER_SELECTED: "다른 매장 선택으로 종료",
  EXPIRED: "선택 기한 만료",
  OPERATOR_CLOSED: "운영 확인 후 종료",
  SELECTED: "매장 선택 완료",
};
const spaceLabels = {
  HALL: "일반 홀",
  ROOM: "별도 룸",
  FLOOR: "한 층 단독",
  WHOLE: "전체 단독",
  ANY: "상관없음",
};
const seatingLabels = {
  CLOSE: "가까이 착석",
  SEPARATED: "떨어져도 가능",
  ANY: "상관없음",
};
export function ProposalCard({
  target: t,
  onDecide,
  busy,
}: {
  target: ReservationRequest["targets"][number];
  onDecide?: (
    action: "select" | "decline",
    target: ReservationRequest["targets"][number],
  ) => void;
  busy: boolean;
}) {
  const r = t.response,
    p = r?.snapshot.offered,
    original = r?.snapshot.requested;
  const state =
    t.candidateState ??
    (r?.kind === "DECLINE"
      ? "MERCHANT_DECLINED"
      : r?.state === "EXPIRED"
        ? "EXPIRED"
        : r
          ? "PROPOSED"
          : "AWAITING_REPLY");
  const money = (n: number | null | undefined) =>
    n == null ? "미확인" : n === 0 ? "없음" : `${n.toLocaleString()}원`;
  return (
    <li className="space-y-6 rounded-control bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="size-[50px] shrink-0 overflow-hidden rounded-control">
            <RestaurantPhoto src={t.photoPath ?? null} alt="" height={50} />
          </div>
          <h3 className="min-w-0 text-xl font-semibold break-words">
            {t.restaurantName}
          </h3>
        </div>
        <span
          className={cn(
            "rounded-pill px-3 py-2 text-xs",
            state === "PROPOSED"
              ? r?.kind === "CHANGE"
                ? "bg-choice"
                : "bg-accent/50"
              : "bg-soft text-secondary",
          )}
        >
          {state === "PROPOSED"
            ? r?.kind === "CHANGE"
              ? "조건 변경"
              : "조건 일치"
            : candidateLabels[state]}
        </span>
      </div>
      {p && (
        <>
          {r?.kind === "CHANGE" && original && (
            <div className="space-y-2 rounded-control bg-choice px-4 py-3 text-xs">
              <p className="font-semibold">변경 제안</p>
              {p.startsAt !== original.startsAt && (
                <p>
                  {koreanDateLabel(original.startsAt)} →{" "}
                  <strong className="text-brand-action">
                    {koreanDateLabel(p.startsAt)}
                  </strong>
                </p>
              )}
              {p.expectedGuests !== original.expectedGuests && (
                <p>
                  {original.expectedGuests}명 →{" "}
                  <strong className="text-brand-action">
                    {p.expectedGuests}명
                  </strong>
                </p>
              )}
              {original.space !== p.space && (
                <p>
                  공간 {spaceLabels[original.space]} →{" "}
                  <strong>{spaceLabels[p.space]}</strong>
                </p>
              )}
              {original.seating !== p.seating && (
                <p>
                  착석 {seatingLabels[original.seating]} →{" "}
                  <strong>{seatingLabels[p.seating]}</strong>
                </p>
              )}
            </div>
          )}
          <dl className="space-y-4 text-xs [&>div]:grid [&>div]:grid-cols-[5rem_minmax(0,1fr)] [&>div]:gap-3 [&_dt]:text-muted [&_dd]:break-words">
            <div>
              <dt>예약금</dt>
              <dd>
                {p.deposit.kind === "PER_RESERVATION"
                  ? "예약별 협의"
                  : money(p.deposit.amount)}
              </dd>
            </div>
            <div>
              <dt>이용 시간</dt>
              <dd>
                {p.usageTime?.kind === "UNLIMITED"
                  ? "별도 시간 제한 없음"
                  : p.usageTime?.kind === "MINUTES"
                    ? `${p.usageTime.minutes}분`
                    : "미확인"}
              </dd>
            </div>
            <div>
              <dt>사장님 한마디</dt>
              <dd className="whitespace-pre-wrap">
                {p.note || "별도 안내 없음"}
              </dd>
            </div>
            <div>
              <dt>선택 기한</dt>
              <dd>{r?.expiresAt ? koreanDateLabel(r.expiresAt) : "미확인"}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">
            기한까지 해당 날짜·시간·인원에 필요한 좌석을 유지해요. 수락 후
            메뉴·예약금을 준비해요.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">
              메뉴·이용·변경 조건
            </summary>
            <dl className="mt-3 space-y-3">
              <div>
                <dt>최소 이용금액 / 최소 주문 수량</dt>
                <dd>
                  {money(p.minimumSpend)} /{" "}
                  {p.minimumQuantity == null
                    ? "미확인"
                    : `${p.minimumQuantity}개`}
                </dd>
              </div>
              <div>
                <dt>별도 대관료</dt>
                <dd>{money(p.separateFee)}</dd>
              </div>
              <div>
                <dt>메뉴 전달 기한</dt>
                <dd>
                  {p.menuDeadlineAt
                    ? koreanDateLabel(p.menuDeadlineAt)
                    : "미확인"}
                </dd>
              </div>
              <div>
                <dt>변경·취소·환불 조건</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {p.changeCancellationPolicy || "미확인"}
                </dd>
              </div>
            </dl>
          </details>
        </>
      )}
      {r?.kind === "DECLINE" && (
        <p className="text-sm break-words">{r.reason}</p>
      )}
      {state === "AWAITING_REPLY" && (
        <p className="text-xs text-muted">
          아직 매장 답변이 없어요. 자동 불가로 바뀌지 않으며, 응답이 어렵다면
          운영 확인이 필요해요.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Link
          href={`/restaurants?restaurant=${t.restaurantId}`}
          className="text-xs font-semibold text-link underline"
        >
          메뉴 · 매장 정보
        </Link>
        {t.canSelect && onDecide && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onDecide("decline", t)}
            >
              불가
            </Button>
            <Button disabled={busy} onClick={() => onDecide("select", t)}>
              수락
            </Button>
          </div>
        )}
      </div>
      {["FAILED", "UNKNOWN", "HELD"].includes(t.deliveryStatus) && (
        <p className="text-xs text-danger">
          문의 문자{" "}
          {t.deliveryStatus === "FAILED"
            ? "전달 실패"
            : t.deliveryStatus === "UNKNOWN"
              ? "접수 확인 필요"
              : "발송 보류"}{" "}
          · 문의 내용은 저장됐어요.
        </p>
      )}
    </li>
  );
}
