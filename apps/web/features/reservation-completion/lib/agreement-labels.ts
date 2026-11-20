import { koreanDateLabel } from "@/shared/lib/korean-date";
import type { Agreement } from "../types/completion.types";

export const won = (value: number | null | undefined) =>
  value == null ? "미확인" : `${value.toLocaleString("ko-KR")}원`;
export const agreementDate = (value: string | null | undefined) =>
  value ? koreanDateLabel(value) : "미확인";
export const spaceLabels = {
  ANY: "상관없음",
  HALL: "일반 홀",
  ROOM: "룸",
  FLOOR: "한 층",
  WHOLE: "전체 대관",
};
export const seatingLabels = {
  ANY: "상관없음",
  CLOSE: "가까이 착석",
  SEPARATED: "떨어져도 가능",
};
export const usageLabel = (agreement: Agreement) =>
  agreement.usageTime?.kind === "UNLIMITED"
    ? "제한 없음"
    : agreement.usageTime?.kind === "MINUTES"
      ? `${agreement.usageTime.minutes}분`
      : "미확인";
