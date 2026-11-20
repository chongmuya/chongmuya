import { z } from "zod";
import { validPublicPhone } from "../lib/restaurant-public-phone.js";

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
export type PolicyDescriptionKey =
  | "operatingHours"
  | "bookingPolicy"
  | "depositPolicy"
  | "menuPolicy"
  | "cancellationPolicy";
// Server-owned provenance inside the existing JSONB; never accepted from registration inputs.
export type StoredRestaurantPolicies = RestaurantPolicies & {
  weeklyHours?: {
    days: {
      kind: "DEFAULT" | "CLOSED" | "OPEN";
      start: string;
      end: string;
      endDayOffset: 0 | 1;
    }[];
    note: string;
  };
  descriptionOverrides: PolicyDescriptionKey[];
  sourceDescriptions: Record<PolicyDescriptionKey, string | null>;
};
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
    category: z.string().max(40),
    phone: text(20),
    publicPhone: text(30).optional(),
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
    publicPhone: "",
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
export function validRegistration(
  data: RegistrationData,
  preserveExistingContact = false,
) {
  return (
    !!data.name.trim() &&
    !!data.addressQuery.trim() &&
    validPublicPhone(data.publicPhone) &&
    (preserveExistingContact || /^01[016789]\d{7,8}$/.test(data.phone)) &&
    data.spaces.length > 0 &&
    data.spaces.every(
      (s) =>
        !!s.label.trim() &&
        (s.capacity === null ||
          s.minGuests === null ||
          s.minGuests <= s.capacity) &&
        (data.maxCapacity === null ||
          s.capacity === null ||
          s.capacity <= data.maxCapacity),
    ) &&
    validPolicies(data.policies)
  );
}
export function validPolicies(p: RestaurantPolicies) {
  const conditional = (required: boolean, value: number | null) =>
    required ? value !== null && value > 0 : value === null;
  const validTime = (v: string, end = false) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v) || (end && v === "24:00");
  const minutes = (v: string) =>
    Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  return (
    (!p.hours ||
      (validTime(p.hours.start) &&
        validTime(p.hours.end, true) &&
        !(p.hours.end === "24:00" && p.hours.endDayOffset !== 0) &&
        minutes(p.hours.end) + p.hours.endDayOffset * 1440 >
          minutes(p.hours.start))) &&
    (p.holidays.kind === "WEEKLY"
      ? p.holidays.weekdays.length > 0 &&
        new Set(p.holidays.weekdays).size === p.holidays.weekdays.length
      : p.holidays.weekdays.length === 0) &&
    (p.holidays.kind === "IRREGULAR" || p.holidays.note === "") &&
    conditional(p.advance.kind === "DAYS_BEFORE", p.advance.days) &&
    conditional(p.minimumOrder.kind === "AMOUNT", p.minimumOrder.amount) &&
    conditional(p.minimumOrder.kind === "QUANTITY", p.minimumOrder.quantity) &&
    (p.minimumOrder.kind === "QUANTITY"
      ? !!p.minimumOrder.unit.trim()
      : p.minimumOrder.unit === "") &&
    [p.menuDeadline, p.guestDeadline].every((d) =>
      conditional(
        d.kind === "DAYS_BEFORE" || d.kind === "HOURS_BEFORE",
        d.value,
      ),
    ) &&
    conditional(p.usage.kind === "LIMITED", p.usage.minutes) &&
    (p.deposit.kind === "NONE"
      ? p.deposit.amount === 0
      : conditional(p.deposit.kind === "FIXED", p.deposit.amount))
  );
}
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

const weeklyTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const weeklyHoursSchema = z
  .object({
    days: z
      .array(
        z
          .object({
            kind: z.enum(["DEFAULT", "CLOSED", "OPEN"]),
            start: weeklyTime,
            end: weeklyTime,
            endDayOffset: z.union([z.literal(0), z.literal(1)]),
          })
          .strict(),
      )
      .length(7),
    note: z.string().max(500),
  })
  .strict()
  .refine((v) =>
    v.days.every(
      (d) =>
        d.kind !== "OPEN" ||
        (d.endDayOffset === 0 ? d.end > d.start : d.end <= d.start),
    ),
  );
