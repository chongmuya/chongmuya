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
  cancellationPolicy: [],
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
// Survey descriptions and typed edits share one persisted model. Text is never parsed into money or deadlines.
export function catalogPolicies(
  source: Partial<Record<PolicyDescriptionKey, string | null>> = {},
): StoredRestaurantPolicies {
  return {
    ...emptyRegistration().policies,
    descriptionOverrides: [],
    sourceDescriptions: {
      operatingHours: source.operatingHours ?? null,
      bookingPolicy: source.bookingPolicy ?? null,
      depositPolicy: source.depositPolicy ?? null,
      menuPolicy: source.menuPolicy ?? null,
      cancellationPolicy: source.cancellationPolicy ?? null,
    },
  };
}
export function savePolicies(
  next: RestaurantPolicies,
  previous: StoredRestaurantPolicies | null,
  isNew: boolean,
): StoredRestaurantPolicies {
  if (isNew)
    return {
      ...catalogPolicies(),
      ...next,
      descriptionOverrides: descriptionKeys,
    };
  const before = previous ?? catalogPolicies();
  const replaced = new Set(before.descriptionOverrides);
  for (const key of descriptionKeys)
    if (
      descriptionFields[key].some(
        (field) => !isDeepStrictEqual(before[field], next[field]),
      )
    )
      replaced.add(key);
  return {
    ...next,
    sourceDescriptions: before.sourceDescriptions,
    descriptionOverrides: [...replaced],
  };
}
export const normalizeRestaurantText = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ");
export function policyDescriptions(p: StoredRestaurantPolicies) {
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
  const descriptions: Record<PolicyDescriptionKey, string | null> = {
    cancellationPolicy: p.sourceDescriptions.cancellationPolicy,
    operatingHours: p.hours
      ? `${p.hours.start}~${p.hours.endDayOffset ? "익일 " : ""}${p.hours.end} / ${holidays}`
      : `영업시간 확인 필요 / ${holidays}`,
    bookingPolicy:
      [
        p.sourceDescriptions.bookingPolicy,
        p.advance.kind !== "UNKNOWN" &&
          "사전 문의: " +
            (p.advance.kind === "SAME_DAY"
              ? "당일 가능"
              : p.advance.kind === "NO_FIXED_RULE"
                ? "정해진 기준 없음"
                : `${p.advance.days}일 전`),
        order.kind !== "UNKNOWN" &&
          "최소 주문: " +
            (order.kind === "NONE"
              ? "없음"
              : order.kind === "AMOUNT"
                ? `${order.amount!.toLocaleString("ko-KR")}원`
                : `${order.quantity} ${order.unit}`),
        p.guestDeadline.kind !== "UNKNOWN" &&
          "인원 변경: " + deadline(p.guestDeadline),
        p.usage.kind !== "UNKNOWN" &&
          "이용 시간: " +
            (p.usage.kind === "NONE" ? "제한 없음" : `${p.usage.minutes}분`),
      ]
        .filter(Boolean)
        .join(" · ") || null,
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
  const replaced = p.descriptionOverrides;
  for (const key of descriptionKeys)
    if (!replaced.includes(key)) descriptions[key] = p.sourceDescriptions[key];
  return descriptions;
}
