import { z } from "zod";
export const scheduleSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "일정 이름을 입력해 주세요.")
      .max(100, "100자 이내로 입력해 주세요."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 선택해 주세요."),
    time: z.string(),
    allDay: z.boolean(),
    memo: z.string().max(100, "메모는 100자 이내로 입력해 주세요."),
  })
  .refine((d) => d.allDay || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(d.time), {
    path: ["time"],
    message: "시간을 선택해 주세요.",
  });
export type ScheduleFields = z.infer<typeof scheduleSchema>;
