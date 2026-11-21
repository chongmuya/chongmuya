import { Button } from "@/shared/ui/button";
import type { Completion } from "../types/completion.types";
import { won } from "./completion-summary";
export function ReviewCurrent({
  data,
  baseVersion,
  accountChanged = false,
  compact = false,
  onReview,
}: {
  data: Completion;
  baseVersion: number;
  accountChanged?: boolean;
  compact?: boolean;
  onReview: () => void;
}) {
  if (data.version === baseVersion && !accountChanged) return null;
  if (compact)
    return (
      <div role="alert" className="rounded-control bg-choice px-4 py-2 text-sm">
        <p>예약 정보가 바뀌었어요. 입력한 내용은 유지됩니다.</p>
        <button
          type="button"
          className="min-h-11 font-medium text-link underline"
          onClick={onReview}
        >
          최신 정보로 계속
        </button>
      </div>
    );
  return (
    <div
      role="alert"
      className="space-y-3 rounded-control bg-choice p-4 text-sm"
    >
      <p>
        {accountChanged ? "연결된 계좌가 바뀌었어요." : "예약이 변경됐어요."}{" "}
        입력값은 유지돼요. 최신 내역을 확인한 뒤 다시 적용해 주세요.
      </p>
      {accountChanged && data.ownerDepositAccount && (
        <p>
          {data.ownerDepositAccount.bank} · 끝자리{" "}
          {data.ownerDepositAccount.lastDigits}
        </p>
      )}
      <p>
        {data.agreement.expectedGuests}명 · 예약금 {won(data.guidance.amount)} ·
        안내 {data.guidance.revision}차 · 실제 수령 {won(data.receivedAmount)} ·
        실제 반환 {won(data.refundedAmount)}
      </p>
      <p>{data.guidance.policy}</p>
      <Button onClick={onReview}>최신 내용 확인 후 입력 재적용</Button>
    </div>
  );
}
