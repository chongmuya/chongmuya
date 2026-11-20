import Image from "next/image";
import Link from "next/link";
import { Button, buttonStyles } from "@/shared/ui/button";
import { koreanDateLabel } from "@/shared/lib/korean-date";
import type { Reply, RequestSnapshot } from "../types/reply.types";
import { inquiryClosureMessage } from "./closed-inquiry";
export const spaceLabel = {
  ANY: "상관없음",
  HALL: "일반 홀",
  ROOM: "룸",
  FLOOR: "한 층 대관",
  WHOLE: "전체 대관",
};
export const seatingLabel = {
  ANY: "상관없음",
  CLOSE: "함께 착석",
  SEPARATED: "분리 착석",
};
export const money = (n: number | null) =>
  n === null
    ? "확인 필요"
    : n === 0
      ? "없음"
      : `${n.toLocaleString("ko-KR")}원`;
export function RequestSummary({ snapshot: s }: { snapshot: RequestSnapshot }) {
  return (
    <dl className="space-y-3 text-sm [&>div]:grid [&>div]:grid-cols-[5rem_minmax(0,1fr)] [&>div]:gap-3">
      <div>
        <dt className="text-muted">행사</dt>
        <dd>
          {s.eventName} · {s.groupName ?? "개인 행사"}
        </dd>
      </div>
      <div>
        <dt className="text-muted">일시·인원</dt>
        <dd>
          {koreanDateLabel(s.startsAt)} · {s.expectedGuests}명
        </dd>
      </div>
      <div>
        <dt className="text-muted">지역·공간</dt>
        <dd>
          {s.region} · {spaceLabel[s.space]}
          {s.spaceImportance
            ? ` (${s.spaceImportance === "REQUIRED" ? "꼭 필요" : "희망"})`
            : ""}
        </dd>
      </div>
      <div>
        <dt className="text-muted">좌석</dt>
        <dd>
          {seatingLabel[s.seating]}
          {s.seatingImportance
            ? ` (${s.seatingImportance === "REQUIRED" ? "꼭 필요" : "희망"})`
            : ""}
        </dd>
      </div>
      {(s.budgetAmount !== null ||
        s.alcohol === "INCLUDED" ||
        s.alcohol === "EXCLUDED") && (
        <div>
          <dt className="text-muted">예산·주류</dt>
          <dd>
            {s.budgetAmount !== null &&
              `${s.budgetBasis === "PER_PERSON" ? "1인당" : "전체"} ${money(s.budgetAmount)} · `}
            주류{" "}
            {s.alcohol === "INCLUDED"
              ? "포함"
              : s.alcohol === "EXCLUDED"
                ? "별도"
                : "미정"}
          </dd>
        </div>
      )}
      {s.additionalRequests && (
        <div>
          <dt className="text-muted">추가 요청</dt>
          <dd className="whitespace-pre-wrap break-words">
            {s.additionalRequests}
          </dd>
        </div>
      )}
    </dl>
  );
}
export function SubmittedReply({
  response,
  closedState,
  onDone,
}: {
  response: Reply;
  closedState?: string | null;
  onDone?: () => void;
}) {
  const declined = response.kind === "DECLINE";
  const request = response.snapshot.requested;
  const offer = response.snapshot.offered;
  return (
    <section className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center gap-4 py-10">
      <header className="space-y-3 text-center">
        <Image
          src={
            declined
              ? "/images/merchant-replies/sent-declined.svg"
              : "/images/merchant-replies/sent-clock.svg"
          }
          alt=""
          width={declined ? 37.1667 : 42}
          height={declined ? 41.5002 : 42}
          className="mx-auto"
        />
        <h1 className="text-lg font-bold">이미 답변을 보냈어요</h1>
        <p className="text-sm text-muted">
          {closedState
            ? inquiryClosureMessage(closedState)
            : declined
              ? "예약이 어렵다는 답변을 총무에게 전달했어요."
              : "총무가 매장을 선택하면 문자로 알려드릴게요."}
        </p>
      </header>
      {declined ? (
        <p className="mx-auto max-w-full rounded-control bg-choice px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">
          <span className="mr-2 text-muted">전한 사유</span>
          {response.reason}
        </p>
      ) : (
        <>
          {offer && (
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4 rounded-control border border-field bg-surface px-5 py-4 text-sm">
              <div className="space-y-2 text-center text-brand-action">
                <Image
                  src="/images/merchant-replies/sent-date.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="mx-auto"
                />
                <p>{koreanDateLabel(offer.startsAt)}</p>
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-2">
                  <Image
                    src="/images/restaurants/guests.svg"
                    alt=""
                    width={16.848}
                    height={14.8528}
                  />
                  {offer.expectedGuests}명
                </p>
                {request.budgetAmount !== null && (
                  <p className="flex items-center gap-2">
                    <Image
                      src="/images/calendar/budget.svg"
                      alt=""
                      width={17.2}
                      height={13.2}
                    />
                    {request.budgetBasis === "PER_PERSON" ? "1인 " : "전체 "}
                    {money(request.budgetAmount)}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <Image
                    src="/images/restaurants/location.svg"
                    alt=""
                    width={18}
                    height={18}
                  />
                  {request.region}
                </p>
              </div>
            </div>
          )}
          <ReplySummary response={response} showHold={!closedState} />
          <details className="space-y-3 text-sm">
            <summary className="cursor-pointer text-right font-semibold text-brand-action">
              전체 예약문의 보기
            </summary>
            <RequestSummary snapshot={request} />
          </details>
        </>
      )}
      <p className="text-center text-xs text-muted">
        오입력이 있거나 좌석을 유지하기 어려우면 기존 연락처로 총무에게 전화해
        주세요.
      </p>
      {onDone ? (
        <Button className="w-full" onClick={onDone}>
          확인
        </Button>
      ) : (
        <Link className={buttonStyles({ className: "w-full" })} href="/">
          확인
        </Link>
      )}
    </section>
  );
}

export function ReplySummary({
  response: r,
  showHold = true,
}: {
  response: Reply;
  showHold?: boolean;
}) {
  const p = r.snapshot.offered,
    original = r.snapshot.requested;
  return (
    <section className="space-y-3 rounded-control border border-brand/20 bg-surface p-4 text-sm">
      <h3 className="font-bold">
        {
          { AVAILABLE: "가능 제안", CHANGE: "조건 변경 제안", DECLINE: "불가" }[
            r.kind
          ]
        }{" "}
        · {r.revision}차 답변
      </h3>
      <p className="text-xs text-muted">{koreanDateLabel(r.createdAt)}</p>
      {r.kind === "DECLINE" ? (
        <p className="whitespace-pre-wrap break-words">{r.reason}</p>
      ) : (
        p && (
          <>
            <dl className="space-y-2">
              <div>
                <dt>일시</dt>
                <dd>
                  {r.kind === "CHANGE" &&
                    Date.parse(p.startsAt) !==
                      Date.parse(original.startsAt) && (
                      <span className="block text-muted">
                        요청: {koreanDateLabel(original.startsAt)}
                      </span>
                    )}
                  {koreanDateLabel(p.startsAt)}
                </dd>
              </div>
              <div>
                <dt>인원·공간</dt>
                <dd>
                  {r.kind === "CHANGE" && (
                    <span className="block text-muted">
                      요청: {original.expectedGuests}명 ·{" "}
                      {spaceLabel[original.space]} ·{" "}
                      {seatingLabel[original.seating]}
                    </span>
                  )}
                  {p.expectedGuests}명 · {spaceLabel[p.space]} ·{" "}
                  {seatingLabel[p.seating]}
                </dd>
              </div>
              <div>
                <dt>최소 이용금액 / 별도 대관료</dt>
                <dd>
                  {money(p.minimumSpend)} / {money(p.separateFee)}
                </dd>
              </div>
              <div>
                <dt>예약금</dt>
                <dd>
                  {p.deposit.kind === "PER_RESERVATION"
                    ? "예약별 협의"
                    : money(p.deposit.amount)}
                </dd>
              </div>
              <div>
                <dt>메뉴 확정</dt>
                <dd>
                  {p.menuDeadlineAt
                    ? koreanDateLabel(p.menuDeadlineAt)
                    : "확인 필요"}
                </dd>
              </div>
            </dl>
            <dl className="space-y-3 text-xs [&>div]:grid [&>div]:grid-cols-[6rem_minmax(0,1fr)] [&>div]:gap-2">
              <div>
                <dt className="text-muted">이용 시간</dt>
                <dd>
                  {p.usageTime?.kind === "UNLIMITED"
                    ? "별도 시간 제한 없음"
                    : p.usageTime?.kind === "MINUTES"
                      ? `${p.usageTime.minutes}분`
                      : "미확인"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">최소 주문 수량</dt>
                <dd>
                  {p.minimumQuantity == null
                    ? "미확인"
                    : `${p.minimumQuantity}개`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">변경·취소·환불</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {p.changeCancellationPolicy || "미확인"}
                </dd>
              </div>
            </dl>
            {showHold && (
              <p className="text-xs text-muted">
                선택 기한까지 제안한 날짜·시간·인원에 필요한 좌석을 유지해요.
              </p>
            )}
            {p.note && (
              <p className="whitespace-pre-wrap break-words">{p.note}</p>
            )}
            <p className="font-semibold text-brand-action">
              {r.state === "EXPIRED"
                ? "제안 선택 기한이 지났어요"
                : `선택 기한: ${koreanDateLabel(r.expiresAt!)}`}
            </p>
          </>
        )
      )}
    </section>
  );
}
