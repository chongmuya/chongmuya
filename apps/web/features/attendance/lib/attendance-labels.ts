import type { AttendanceState, ReviewReason } from "../types/attendance.types";
export const stateLabel = (value: AttendanceState | null) =>
  value
    ? { UNANSWERED: "미응답", ATTENDING: "참석", ABSENT: "불참" }[value]
    : "미응답";
export const reasonLabel = (reason: ReviewReason) =>
  ({
    DUPLICATE_IDENTITY: "이름과 뒤 4자리까지 같은 사람이 있어요",
    AMBIGUOUS_NAME: "이름만으로 구분할 수 없어요",
    NOT_LISTED: "행사 명단에 없는 이름이에요",
  })[reason];
