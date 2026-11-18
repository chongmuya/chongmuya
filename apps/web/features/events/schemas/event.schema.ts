import { z } from "zod";

export const eventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "행사명을 입력해 주세요.")
    .max(100, "행사명은 100자 이내로 입력해 주세요."),
  date: z.union([
    z.literal(""),
    z.iso.datetime({
      local: true,
      precision: -1,
      error: "올바른 날짜와 시간을 입력해 주세요.",
    }),
  ]),
});
export type EventFormValues = z.infer<typeof eventSchema>;

export function eventInput(values: EventFormValues, groupId?: string) {
  return {
    name: values.name,
    groupId,
    scheduledAt: values.date
      ? new Date(`${values.date}+09:00`).toISOString()
      : undefined,
  };
}
