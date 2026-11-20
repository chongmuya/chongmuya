import { serviceArea } from "@/shared/lib/service-area";
import { fromKoreanDateInput, koreanDateInput } from "@/shared/lib/korean-date";
import { guestCountSchema } from "@/shared/lib/guest-count";
import { z } from "zod";
import type { Account } from "@/features/auth/types";
import type { InquiryConditions } from "../types/inquiry.types";

export const conditionsSchema = z
  .object({
    date: z.iso.date("날짜를 확인해 주세요."),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시작 시간을 입력해 주세요."),
    expectedGuests: guestCountSchema,
    seating: z.enum(["CLOSE", "SEPARATED", "ANY"]),
    space: z.enum(["HALL", "ROOM", "FLOOR", "WHOLE", "ANY"]),
    seatingImportance: z.enum(["REQUIRED", "PREFERRED"]),
    spaceImportance: z.enum(["REQUIRED", "PREFERRED"]),
    budgetBasis: z.enum(["PER_PERSON", "TOTAL"]),
    budgetAmount: z
      .string()
      .regex(/^(?:[1-9]\d{0,9})?$/, "예산은 1원 이상의 정수로 입력해 주세요.")
      .refine(
        (v) => !v || Number(v) <= 1000000000,
        "예산은 10억원 이하로 입력해 주세요.",
      ),
    alcohol: z.enum(["INCLUDED", "EXCLUDED", "UNKNOWN"]),
    additionalRequests: z
      .string()
      .trim()
      .max(1000, "요청사항은 1,000자 이내로 입력해 주세요."),
    contactName: z
      .string()
      .trim()
      .min(1, "담당자 이름을 입력해 주세요.")
      .max(80),
    contactPhone: z
      .string()
      .regex(
        /^0\d{8,10}$/,
        "0으로 시작하는 전화번호 9~11자리를 입력해 주세요.",
      ),
  })
  .refine(
    (v) =>
      Date.parse(fromKoreanDateInput(`${v.date}T${v.time}`) ?? "") > Date.now(),
    { path: ["date"], message: "미래 날짜와 시작 시간으로 입력해 주세요." },
  );
export type ConditionsValues = z.infer<typeof conditionsSchema>;
function conditionSchedule(startsAt: string | null) {
  const local = koreanDateInput(startsAt);
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function savedInquirySchedule(startsAt: string | null) {
  if (!startsAt || Date.parse(startsAt) <= Date.now()) return null;
  const schedule = conditionSchedule(startsAt);
  const minute = fromKoreanDateInput(`${schedule.date}T${schedule.time}`);
  return minute && Date.parse(minute) > Date.now()
    ? { ...schedule, startsAt }
    : null;
}

export function initialConditions(
  account: Account,
  scheduledAt: string | null,
): ConditionsValues {
  return {
    ...conditionSchedule(scheduledAt),
    expectedGuests: "",
    seating: "ANY",
    space: "ANY",
    seatingImportance: "PREFERRED",
    spaceImportance: "PREFERRED",
    budgetBasis: "PER_PERSON",
    budgetAmount: "",
    alcohol: "UNKNOWN",
    additionalRequests: "",
    contactName: account.name ?? "",
    contactPhone: account.phone ?? "",
  };
}
export function inquiryConditions(
  v: ConditionsValues,
  savedStartsAt?: string,
): InquiryConditions {
  return {
    startsAt:
      savedStartsAt ?? new Date(`${v.date}T${v.time}:00+09:00`).toISOString(),
    expectedGuests: Number(v.expectedGuests),
    region: serviceArea.label,
    seating: v.seating,
    space: v.space,
    seatingImportance: v.seating === "ANY" ? null : v.seatingImportance,
    spaceImportance: v.space === "ANY" ? null : v.spaceImportance,
    budgetBasis: v.budgetAmount ? v.budgetBasis : null,
    budgetAmount: v.budgetAmount ? Number(v.budgetAmount) : null,
    alcohol: v.budgetAmount ? v.alcohol : null,
    additionalRequests: v.additionalRequests || null,
  };
}
