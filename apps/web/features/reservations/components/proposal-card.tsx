import { RestaurantPhoto } from "@/features/restaurants/client";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { koreanDateInput, koreanDateLabel } from "@/shared/lib/korean-date";
import type { ReservationRequest } from "../types/inquiry.types";
import { InquiryNotice } from "./inquiry-notice";

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
export const spaceLabels = {
  HALL: "일반 홀",
  ROOM: "별도 룸",
  FLOOR: "한 층 단독",
  WHOLE: "전체 단독",
  ANY: "상관없음",
};
export const seatingLabels = {
  CLOSE: "가까이 착석",
  SEPARATED: "떨어져도 가능",
  ANY: "상관없음",
};

function money(amount: number | null | undefined) {
  return amount == null
    ? "미확인"
    : amount === 0
      ? "없음"
      : `${amount.toLocaleString("ko-KR")}원`;
}

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
  const changed = r?.kind === "CHANGE";
  const decide = t.canSelect ? onDecide : undefined;
  const originalDate = koreanDateInput(original?.startsAt);
  const proposedDate = koreanDateInput(p?.startsAt);
  const sameDay = originalDate.slice(0, 10) === proposedDate.slice(0, 10);
  const changes =
    changed && p && original
      ? [
          [
            sameDay ? "시간 변경" : "일시 변경",
            sameDay
              ? originalDate.slice(11, 16)
              : koreanDateLabel(original.startsAt),
            sameDay ? proposedDate.slice(11, 16) : koreanDateLabel(p.startsAt),
          ],
          [
            "인원 변경",
            `${original.expectedGuests}명`,
            `${p.expectedGuests}명`,
          ],
          ["공간 변경", spaceLabels[original.space], spaceLabels[p.space]],
          [
            "착석 변경",
            seatingLabels[original.seating],
            seatingLabels[p.seating],
          ],
        ].filter(([, before, after]) => before !== after)
      : [];

  return (
    <li className="flex flex-col gap-7 rounded-control bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-32 items-center gap-3">
          <div className="size-[50px] shrink-0 overflow-hidden rounded-sm">
            <RestaurantPhoto src={t.photoPath ?? null} alt="" height={50} />
          </div>
          <h3 className="min-w-0 text-xl leading-tight font-semibold wrap-break-word">
            {t.restaurantName}
          </h3>
        </div>
        <span
          className={cn(
            "rounded-pill px-3 py-2.5 text-base leading-none font-medium text-muted shadow-control",
            state === "PROPOSED"
              ? changed
                ? "bg-choice"
                : "bg-accent/50"
              : "bg-soft",
          )}
        >
          {state === "PROPOSED"
            ? changed
              ? "조건 불일치"
              : "조건 일치"
            : (candidateLabels[state] ?? "문의 종료")}
        </span>
      </div>
      {changes.length > 0 && (
        <dl className="space-y-2 rounded-sm bg-choice px-4 py-3 text-sm leading-tight font-semibold">
          {changes.map(([label, before, after]) => (
            <div key={label}>
              <dt className="mb-2 text-muted">{label}</dt>
              <dd>
                {before} → <span className="text-brand">{after}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {p && (
        <div className="space-y-4">
          <dl className="space-y-4 text-xs leading-tight [&>div]:grid [&>div]:grid-cols-[clamp(5rem,24vw,6rem)_minmax(0,1fr)] [&>div]:gap-3 [&_dd]:break-keep [&_dd]:wrap-break-word [&_dt]:text-muted">
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
              <dd>
                {r?.expiresAt ? (
                  <time dateTime={r.expiresAt}>
                    {koreanDateLabel(r.expiresAt)}까지
                  </time>
                ) : (
                  "미확인"
                )}
              </dd>
            </div>
            {p.minimumSpend != null && (
              <div>
                <dt>최소 이용금액</dt>
                <dd>{money(p.minimumSpend)}</dd>
              </div>
            )}
            {p.minimumQuantity != null && (
              <div>
                <dt>최소 주문 수량</dt>
                <dd>{p.minimumQuantity}개</dd>
              </div>
            )}
            {p.menuDeadlineAt && (
              <div>
                <dt>메뉴 전달 기한</dt>
                <dd>{koreanDateLabel(p.menuDeadlineAt)}까지</dd>
              </div>
            )}
            {p.changeCancellationPolicy && (
              <div>
                <dt>변경·취소·환불 조건</dt>
                <dd className="whitespace-pre-wrap">
                  {p.changeCancellationPolicy}
                </dd>
              </div>
            )}
          </dl>
          {decide && (
            <>
              <p className="text-xs leading-tight break-keep text-muted">
                매장이 선택 기한까지 좌석을 유지해요. 수락 후{" "}
                {p.deposit.kind === "NONE"
                  ? "메뉴를 준비해 주세요."
                  : "메뉴와 예약금 안내를 확인해 주세요."}
              </p>
              {r?.expiresAt && (
                <InquiryNotice>
                  <p>선택 기한이 지나면 이 제안은 자동으로 만료돼요.</p>
                </InquiryNotice>
              )}
            </>
          )}
        </div>
      )}
      {r?.kind === "DECLINE" && r.reason && (
        <p className="rounded-sm bg-soft px-4 py-3 text-sm wrap-break-word whitespace-pre-wrap">
          {r.reason}
        </p>
      )}
      {decide && (
        <div className="-mt-3 flex justify-end gap-3 border-t border-placeholder pt-4">
          <Button
            variant="outline"
            className="min-h-[50px] border-placeholder px-5 text-sm text-copy"
            disabled={busy}
            onClick={() => decide("decline", t)}
          >
            불가
          </Button>
          <Button
            className="min-h-[50px] px-5 text-sm"
            disabled={busy}
            onClick={() => decide("select", t)}
          >
            수락
          </Button>
        </div>
      )}
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
