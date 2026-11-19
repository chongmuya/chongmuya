import { z } from "zod";

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
  })
  .superRefine((v, ctx) => {
    if (v.date && !v.time)
      ctx.addIssue({
        code: "custom",
        path: ["time"],
        message: "시작 시간을 입력해 주세요.",
      });
    if (v.time && !v.date)
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "날짜를 입력해 주세요.",
      });
  });
export type EventFormValues = z.infer<typeof eventSchema>;

export function eventInput(values: EventFormValues, groupId?: string) {
  return {
    name: values.name,
    groupId,
    scheduledAt: values.date
      ? new Date(`${values.date}T${values.time}:00+09:00`).toISOString()
      : undefined,
  };
}
