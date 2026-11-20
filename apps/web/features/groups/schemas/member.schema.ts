import { z } from "zod";
export const memberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(100, "100자 이내로 입력해 주세요."),
  phoneLast4: z
    .string()
    .regex(/^(?:\d{4})?$/, "숫자 뒤 4자리 또는 빈칸으로 입력해 주세요."),
  label: z.string().trim().max(40, "구분은 40자 이내로 입력해 주세요."),
  exclude: z.boolean(),
  duplicatesConfirmed: z.boolean(),
});
