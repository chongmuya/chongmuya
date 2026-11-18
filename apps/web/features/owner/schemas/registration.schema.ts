import { z } from "zod";

const text = (length: number) => z.string().max(length);
const amount = z.number().int().min(0).max(2_000_000_000).nullable();
const count = z.number().int().positive().max(100_000).nullable();
const deadline = z
  .object({
    kind: z.enum(["ANYTIME", "DAYS_BEFORE", "HOURS_BEFORE", "UNKNOWN"]),
    value: count,
  })
  .strict();
export const policiesSchema = z
  .object({
    hours: z
      .object({
        start: text(5),
        end: text(5),
        endDayOffset: z.union([z.literal(0), z.literal(1)]),
      })
      .strict()
      .nullable(),
    holidays: z
      .object({
        kind: z.enum(["NONE", "WEEKLY", "IRREGULAR", "UNKNOWN"]),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7),
        note: text(500),
      })
      .strict(),
    advance: z
      .object({
        kind: z.enum(["SAME_DAY", "DAYS_BEFORE", "NO_FIXED_RULE", "UNKNOWN"]),
        days: count,
      })
      .strict(),
    minimumOrder: z
      .object({
        kind: z.enum(["NONE", "AMOUNT", "QUANTITY", "UNKNOWN"]),
        amount,
        quantity: count,
        unit: text(80),
      })
      .strict(),
    menuDeadline: deadline,
    guestDeadline: deadline,
    usage: z
      .object({ kind: z.enum(["NONE", "LIMITED", "UNKNOWN"]), minutes: count })
      .strict(),
    deposit: z
      .object({
        kind: z.enum(["NONE", "FIXED", "PER_RESERVATION", "UNKNOWN"]),
        amount,
      })
      .strict(),
  })
  .strict();
export type RestaurantPolicies = z.infer<typeof policiesSchema>;
export const spaceInputSchema = z
  .object({
    id: z.uuid().optional(),
    label: text(80),
    kind: z.enum(["HALL", "ROOM", "FLOOR", "WHOLE"]),
    availability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
    togetherSeating: z.enum(["YES", "NO", "UNKNOWN"]),
    capacity: count,
    minGuests: amount,
    minSpend: amount,
    separateFee: amount,
    conditions: text(1000).nullable(),
  })
  .strict();
// Incomplete values are retained only in drafts; final validation is separate.
export const registrationSchema = z
  .object({
    name: text(100),
    branchName: text(80),
    addressQuery: text(200),
    detailAddress: text(120),
    category: z.enum(["한식", "호프·주점", "기타 음식점"]),
    phone: text(20),
    receiveConsent: z.boolean(),
    maxCapacity: count,
    minimumGuests: z
      .object({ kind: z.enum(["NONE", "AT_LEAST", "UNKNOWN"]), value: amount })
      .strict(),
    spaces: z.array(spaceInputSchema).max(30),
    policies: policiesSchema,
  })
  .strict();
export type RegistrationData = z.infer<typeof registrationSchema>;
export type VerifiedAddress = {
  id: string;
  query: string;
  roadAddress: string;
  jibunAddress: string;
  baseAddress: string;
  latitude: number | null;
  longitude: number | null;
  region: string;
  source: "naver" | "fake" | "existing";
};
export function emptyRegistration(): RegistrationData {
  return {
    name: "",
    branchName: "",
    addressQuery: "",
    detailAddress: "",
    category: "한식",
    phone: "",
    receiveConsent: false,
    maxCapacity: null,
    minimumGuests: { kind: "UNKNOWN", value: null },
    spaces: [],
    policies: {
      hours: null,
      holidays: { kind: "UNKNOWN", weekdays: [], note: "" },
      advance: { kind: "UNKNOWN", days: null },
      minimumOrder: { kind: "UNKNOWN", amount: null, quantity: null, unit: "" },
      menuDeadline: { kind: "UNKNOWN", value: null },
      guestDeadline: { kind: "UNKNOWN", value: null },
      usage: { kind: "UNKNOWN", minutes: null },
      deposit: { kind: "UNKNOWN", amount: null },
    },
  };
}
export type RegistrationIssue = { path: string; step: number; message: string };
export function registrationIssues(
  data: RegistrationData,
): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  const check = (ok: boolean, path: string, step: number, message: string) => {
    if (!ok) issues.push({ path, step, message });
  };
  const p = data.policies;
  const conditional = (required: boolean, value: number | null) =>
    required ? value !== null && value > 0 : value === null;
  check(!!data.name.trim(), "name", 0, "매장명을 입력해 주세요.");
  check(
    !!data.addressQuery.trim(),
    "addressQuery",
    0,
    "주소를 검색하고 선택해 주세요.",
  );
  check(
    /^01[016789]\d{7,8}$/.test(data.phone),
    "phone",
    0,
    "올바른 휴대폰 번호를 입력해 주세요.",
  );
  check(
    data.minimumGuests.kind === "NONE"
      ? data.minimumGuests.value === 0
      : conditional(
          data.minimumGuests.kind === "AT_LEAST",
          data.minimumGuests.value,
        ),
    "minimumGuests.value",
    1,
    "최소 인원을 확인해 주세요.",
  );
  check(
    data.maxCapacity === null ||
      data.minimumGuests.value === null ||
      data.minimumGuests.value <= data.maxCapacity,
    "maxCapacity",
    1,
    "전체 인원은 최소 인원 이상이어야 해요.",
  );
  check(
    data.spaces.length > 0,
    "spaces",
    1,
    "공간을 한 곳 이상 추가해 주세요.",
  );
  data.spaces.forEach((space, i) => {
    check(
      !!space.label.trim(),
      `spaces.${i}.label`,
      1,
      "공간 이름을 입력해 주세요.",
    );
    check(
      space.capacity === null ||
        space.minGuests === null ||
        space.minGuests <= space.capacity,
      `spaces.${i}.minGuests`,
      1,
      "최소 인원은 공간 정원 이하여야 해요.",
    );
    check(
      data.maxCapacity === null ||
        space.capacity === null ||
        space.capacity <= data.maxCapacity,
      `spaces.${i}.capacity`,
      1,
      "공간 정원은 전체 수용 인원 이하여야 해요.",
    );
  });
  const time = (v: string, end = false) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v) || (end && v === "24:00");
  const minutes = (v: string) =>
    Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  check(
    !p.hours ||
      (time(p.hours.start) &&
        time(p.hours.end, true) &&
        !(p.hours.end === "24:00" && p.hours.endDayOffset !== 0) &&
        minutes(p.hours.end) + p.hours.endDayOffset * 1440 >
          minutes(p.hours.start)),
    "policies.hours.end",
    2,
    "종료 시각과 익일 여부를 확인해 주세요.",
  );
  check(
    p.holidays.kind === "WEEKLY"
      ? p.holidays.weekdays.length > 0 &&
          new Set(p.holidays.weekdays).size === p.holidays.weekdays.length
      : p.holidays.weekdays.length === 0,
    "policies.holidays.weekdays",
    2,
    "정기 휴무 요일을 선택해 주세요.",
  );
  check(
    p.holidays.kind === "IRREGULAR" || p.holidays.note === "",
    "policies.holidays.note",
    2,
    "비정기 휴무일 때만 설명을 입력해 주세요.",
  );
  check(
    conditional(p.advance.kind === "DAYS_BEFORE", p.advance.days),
    "policies.advance.days",
    2,
    "사전 문의 일수를 입력해 주세요.",
  );
  check(
    conditional(p.minimumOrder.kind === "AMOUNT", p.minimumOrder.amount),
    "policies.minimumOrder.amount",
    2,
    "최소 주문 금액을 입력해 주세요.",
  );
  check(
    conditional(p.minimumOrder.kind === "QUANTITY", p.minimumOrder.quantity),
    "policies.minimumOrder.quantity",
    2,
    "최소 주문 수량을 입력해 주세요.",
  );
  check(
    p.minimumOrder.kind === "QUANTITY"
      ? !!p.minimumOrder.unit.trim()
      : p.minimumOrder.unit === "",
    "policies.minimumOrder.unit",
    2,
    "수량의 단위나 대상을 입력해 주세요.",
  );
  for (const key of ["menuDeadline", "guestDeadline"] as const)
    check(
      conditional(
        p[key].kind === "DAYS_BEFORE" || p[key].kind === "HOURS_BEFORE",
        p[key].value,
      ),
      `policies.${key}.value`,
      3,
      "기한을 입력해 주세요.",
    );
  check(
    conditional(p.usage.kind === "LIMITED", p.usage.minutes),
    "policies.usage.minutes",
    3,
    "이용 시간을 분 단위로 입력해 주세요.",
  );
  check(
    p.deposit.kind === "NONE"
      ? p.deposit.amount === 0
      : conditional(p.deposit.kind === "FIXED", p.deposit.amount),
    "policies.deposit.amount",
    3,
    "예약금 금액을 확인해 주세요.",
  );
  return issues;
}
export const validRegistration = (data: RegistrationData) =>
  registrationIssues(data).length === 0;
export const menuInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: text(100).min(1),
    kind: z.enum(["REGULAR", "SET"]),
    price: amount,
    unit: text(30).min(1),
    available: z.boolean(),
    position: z.number().int().min(0).max(10000),
  })
  .strict();

export function registrationStep(path: string) {
  if (
    path.startsWith("spaces") ||
    ["maxCapacity", "minimumGuests"].some((field) => path.startsWith(field))
  )
    return 1;
  if (
    ["hours", "holidays", "advance", "minimumOrder"].some((field) =>
      path.startsWith(`policies.${field}`),
    )
  )
    return 2;
  if (path.startsWith("policies.")) return 3;
  return 0;
}
