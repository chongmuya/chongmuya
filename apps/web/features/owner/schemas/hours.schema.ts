import { z } from "zod";
export const hoursSchema = z.object({
  days: z
    .array(
      z.object({
        kind: z.enum(["DEFAULT", "OPEN", "CLOSED"]),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        endDayOffset: z.union([z.literal(0), z.literal(1)]),
      }),
    )
    .length(7),
  note: z.string().max(500, "500자 이내로 입력해 주세요."),
});
export type HoursFields = z.infer<typeof hoursSchema>;
