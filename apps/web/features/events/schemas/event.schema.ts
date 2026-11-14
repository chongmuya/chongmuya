import { z } from "zod";

export const eventSchema = z.object({
  groupId: z.union([z.literal(""), z.uuid("모임을 확인해 주세요.")]),
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

export function eventInput(values: EventFormValues) {
  return {
    name: values.name,
    groupId: values.groupId || undefined,
    scheduledAt: values.date
      ? new Date(`${values.date}+09:00`).toISOString()
      : undefined,
  };
}

export const linkGroupSchema = z.object({
  groupId: z.uuid("연결할 모임을 선택해 주세요."),
});
