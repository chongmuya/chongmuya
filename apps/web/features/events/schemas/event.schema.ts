import { z } from "zod";
import { fromKoreanDateInput } from "@/shared/lib/korean-date";
import { guestCountSchema } from "@/shared/lib/guest-count";

export const eventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "행사명을 입력해 주세요.")
      .max(100, "행사명은 100자 이내로 입력해 주세요."),
    date: z.union([z.literal(""), z.iso.date("날짜를 확인해 주세요.")]),
    time: z.union([
      z.literal(""),
      z.iso.time({ precision: -1, error: "시간을 확인해 주세요." }),
    ]),
    findVenue: z.boolean().optional(),
    expectedGuests: z.union([guestCountSchema, z.literal("")]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.findVenue && !v.expectedGuests)
      ctx.addIssue({
        code: "custom",
        path: ["expectedGuests"],
        message: "예상 인원을 입력해 주세요.",
      });
    if ((v.date || v.findVenue) && !v.time)
      ctx.addIssue({
        code: "custom",
        path: ["time"],
        message: "시작 시간을 입력해 주세요.",
      });
    if ((v.time || v.findVenue) && !v.date)
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "날짜를 입력해 주세요.",
      });
    const startsAt = fromKoreanDateInput(`${v.date}T${v.time}`);
    if (v.findVenue && startsAt && Date.parse(startsAt) <= Date.now())
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "미래 날짜와 시작 시간으로 입력해 주세요.",
      });
  });
export type EventFormValues = z.infer<typeof eventSchema>;

export function eventInput(values: EventFormValues, groupId?: string) {
  return {
    name: values.name,
    groupId,
    ...(values.findVenue && values.expectedGuests
      ? { expectedGuests: Number(values.expectedGuests) }
      : {}),
    scheduledAt:
      fromKoreanDateInput(`${values.date}T${values.time}`) ?? undefined,
  };
}
