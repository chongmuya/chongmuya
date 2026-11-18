import { isDeepStrictEqual } from "node:util";
import { emptyRegistration } from "../types/registration.js";
import type {
  RestaurantPolicies,
  StoredRestaurantPolicies,
  PolicyDescriptionKey,
} from "../types/registration.js";
const descriptionFields: Record<
  PolicyDescriptionKey,
  (keyof RestaurantPolicies)[]
> = {
  operatingHours: ["hours", "holidays"],
  bookingPolicy: ["advance", "minimumOrder", "guestDeadline", "usage"],
  depositPolicy: ["deposit"],
  menuPolicy: ["menuDeadline"],
};
const descriptionKeys = Object.keys(
  descriptionFields,
) as PolicyDescriptionKey[];
export function policyValues(p: RestaurantPolicies): RestaurantPolicies {
  const {
    hours,
    holidays,
    advance,
    minimumOrder,
    menuDeadline,
    guestDeadline,
    usage,
    deposit,
  } = p;
  return {
    hours,
    holidays,
    advance,
    minimumOrder,
    menuDeadline,
    guestDeadline,
    usage,
    deposit,
  };
}
function overrides(p: StoredRestaurantPolicies) {
  // Rows saved before provenance existed: only known structured values supersede legacy text.
  const empty = emptyRegistration().policies;
  return (
    p.descriptionOverrides ??
    descriptionKeys.filter((key) =>
      descriptionFields[key].some(
        (field) => !isDeepStrictEqual(p[field], empty[field]),
      ),
    )
  );
}
export function savePolicies(
  next: RestaurantPolicies,
  previous: StoredRestaurantPolicies | null,
  isNew: boolean,
): StoredRestaurantPolicies | null {
  if (isNew) return { ...next, descriptionOverrides: descriptionKeys };
  const before = previous ?? emptyRegistration().policies;
  const replaced = new Set(previous ? overrides(previous) : []);
  for (const key of descriptionKeys)
    if (
      descriptionFields[key].some(
        (field) => !isDeepStrictEqual(before[field], next[field]),
      )
    )
      replaced.add(key);
  return !previous && replaced.size === 0
    ? null
    : { ...next, descriptionOverrides: [...replaced] };
}
export const normalizeRestaurantText = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ");
export function policyDescriptions(
  p: StoredRestaurantPolicies,
  legacy: Partial<Record<PolicyDescriptionKey, string | null>> = {},
) {
  const deadline = (d: RestaurantPolicies["menuDeadline"]) =>
    d.kind === "UNKNOWN"
      ? "확인 필요"
      : d.kind === "ANYTIME"
        ? "언제든지 가능"
        : `${d.value}${d.kind === "DAYS_BEFORE" ? "일" : "시간"} 전`;
  const order = p.minimumOrder;
  const holidays =
    p.holidays.kind === "NONE"
      ? "정기 휴무 없음"
      : p.holidays.kind === "WEEKLY"
        ? `${p.holidays.weekdays.map((i) => ["일", "월", "화", "수", "목", "금", "토"][i]).join("·")}요일 휴무`
        : p.holidays.kind === "IRREGULAR"
          ? `비정기 휴무${p.holidays.note ? `: ${p.holidays.note}` : ""}`
          : "휴무 확인 필요";
  const descriptions = {
    operatingHours: p.hours
      ? `${p.hours.start}~${p.hours.endDayOffset ? "익일 " : ""}${p.hours.end} / ${holidays}`
      : `영업시간 확인 필요 / ${holidays}`,
    bookingPolicy: `사전 문의: ${p.advance.kind === "UNKNOWN" ? "확인 필요" : p.advance.kind === "SAME_DAY" ? "당일 가능" : p.advance.kind === "NO_FIXED_RULE" ? "정해진 기준 없음" : `${p.advance.days}일 전`}. 최소 주문: ${order.kind === "UNKNOWN" ? "확인 필요" : order.kind === "NONE" ? "없음" : order.kind === "AMOUNT" ? `${order.amount!.toLocaleString("ko-KR")}원` : `${order.quantity} ${order.unit}`}. 인원 변경: ${deadline(p.guestDeadline)}. 이용 시간: ${p.usage.kind === "UNKNOWN" ? "확인 필요" : p.usage.kind === "NONE" ? "제한 없음" : `${p.usage.minutes}분`}`,
    depositPolicy:
      p.deposit.kind === "NONE"
        ? "예약금 없음"
        : p.deposit.kind === "FIXED"
          ? `예약금 ${p.deposit.amount!.toLocaleString("ko-KR")}원`
          : p.deposit.kind === "PER_RESERVATION"
            ? "예약별 협의"
            : "예약금 확인 필요",
    menuPolicy: `메뉴 확정: ${deadline(p.menuDeadline)}`,
  };
  const replaced = overrides(p);
  for (const key of descriptionKeys)
    if (!replaced.includes(key) && legacy[key])
      descriptions[key] = legacy[key]!;
  return descriptions;
}
