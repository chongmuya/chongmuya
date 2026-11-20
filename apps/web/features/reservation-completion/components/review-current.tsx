import { Button } from "@/shared/ui/button";
import type { Completion } from "../types/completion.types";
import { won } from "./completion-summary";
export function ReviewCurrent({
  data,
  baseVersion,
  onReview,
}: {
  data: Completion;
  baseVersion: number;
  onReview: () => void;
}) {
  if (data.version === baseVersion) return null;
  return (
    <div
      role="alert"
      className="space-y-3 rounded-control bg-choice p-4 text-sm"
    >
      <p>
        예약이 변경됐어요. 입력은 유지됩니다. 최신 내역을 확인한 뒤 명시적으로
        다시 적용해 주세요.
      </p>
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
