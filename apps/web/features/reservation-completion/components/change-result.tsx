import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import type { Change, Completion } from "../types/completion.types";
import { AttendanceLink, ReservationResultIcon } from "./completion-summary";
export function ChangeResult({
  data: q,
  latest,
  organizer,
  onReview,
  onContinue,
  onCancel,
  footer,
}: {
  data: Completion;
  latest: Change;
  organizer: boolean;
  onReview: () => void;
  onContinue: () => void;
  onCancel?: () => void;
  footer?: ReactNode;
}) {
  const kind = latest.kind === "CANCEL" ? "취소" : "변경";
  const pending = latest.status === "REQUESTED" || latest.status === "PROPOSED";
  const rejected = latest.status === "REJECTED";
  const title =
    latest.status === "REQUESTED"
      ? organizer
        ? `예약 ${kind}${latest.kind === "CANCEL" ? "를" : "을"} 요청했어요`
        : `예약 ${kind} 문의가 도착했어요`
      : latest.status === "PROPOSED"
        ? organizer
          ? "매장 제안이 도착했어요"
          : "총무의 확인을 기다려요"
        : rejected
          ? `예약 ${kind}${latest.kind === "CANCEL" ? "가" : "이"} 어려워요`
          : q.cancellation
            ? "예약 취소 완료"
            : q.progress === "CONFIRMED"
              ? "예약이 확정됐어요"
              : "변경 내용이 적용됐어요";
  const caption =
    latest.status === "REQUESTED"
      ? organizer
        ? "매장의 답변을 기다리고 있어요. 기존 예약은 유지돼요."
        : "총무의 문의를 확인해 주세요. 기존 예약은 유지돼요."
      : latest.status === "PROPOSED"
        ? "총무가 제안을 확인하고 수락해야 적용돼요."
        : rejected
          ? "기존 예약으로 진행할지 확인해 주세요."
          : q.cancellation
            ? q.refundedAmount > 0 || (!q.receipt && !q.transfer)
              ? "취소 내역을 확인해 주세요."
              : "환불 여부·금액·반환 일정은 전화로 협의해 주세요."
            : q.progress === "CONFIRMED"
              ? "예약 변경을 확인했어요. 이제 참석 명단을 준비해볼까요?"
              : "합의한 조건을 적용했어요. 남은 확인이 필요해요.";
  return (
    <section
      className="space-y-8 rounded-control bg-surface px-[29px] pt-10 pb-7 shadow-card max-[360px]:px-5"
      aria-label="최근 예약 처리 결과"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <ReservationResultIcon unavailable={rejected} />
        <div className="space-y-4">
          <h2 className="text-2xl leading-[normal] font-bold text-black">
            {title}
          </h2>
          <p
            className={cn(
              "mx-auto text-xs leading-[normal] break-keep",
              pending
                ? "max-w-[219px]"
                : rejected
                  ? "max-w-[198px]"
                  : "max-w-[162px]",
            )}
          >
            {caption}
          </p>
          {!pending &&
            !rejected &&
            !q.cancellation &&
            q.progress === "CONFIRMED" &&
            organizer && <AttendanceLink eventId={q.eventId} />}
        </div>
      </div>
      {(pending || rejected) && (
        <div className="space-y-3 rounded-[12px] border border-placeholder px-5 py-6">
          <h3 className="text-sm leading-[normal] font-semibold text-secondary">
            {kind} 요청 내용
          </h3>
          <span className="inline-block rounded-pill bg-choice px-2 py-1 text-base leading-[normal] font-medium shadow-control">
            {{
              SCHEDULE: "날짜·시간",
              GUESTS: "인원",
              MENU: "메뉴",
              OTHER: "기타",
              REFUND: "환불 예정액",
            }[latest.subject] ?? kind}
          </span>
          <p className="whitespace-pre-wrap text-base leading-[normal] font-medium break-keep wrap-anywhere">
            {latest.reason}
          </p>
        </div>
      )}
      {rejected ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm leading-[normal] font-semibold">
              사장님 답변
            </h3>
            <div className="flex items-start gap-2.5">
              <span className="relative h-[26px] w-[22px] shrink-0">
                <Image
                  src="/images/reservations/reply-arrow.svg"
                  width={24.4093}
                  height={26}
                  alt=""
                  className="absolute -left-px max-w-none"
                />
              </span>
              <p className="min-w-0 flex-1 rounded bg-choice p-2.5 text-base leading-[normal] font-medium whitespace-pre-wrap break-keep wrap-anywhere">
                {latest.resolutionReason || "처리 불가 사유를 확인해 주세요."}
              </p>
            </div>
          </div>
          {footer}
        </div>
      ) : (
        footer
      )}
      {pending && (latest.status === "PROPOSED" || !organizer) && (
        <Button className="w-full" onClick={onReview}>
          {organizer ? "바뀐 조건 확인하기" : "예약 변경 확인하기"}
        </Button>
      )}
      {rejected && (
        <div className="space-y-2">
          <Button className="w-full" onClick={onContinue}>
            {q.cancellation ? "환불 내역 확인하기" : "기존 예약으로 진행하기"}
          </Button>
          {!q.cancellation && (
            <button
              type="button"
              className="block min-h-11 w-full text-base leading-[normal] font-semibold text-muted"
              onClick={onCancel ?? onReview}
            >
              예약 취소하기
            </button>
          )}
        </div>
      )}
    </section>
  );
}
