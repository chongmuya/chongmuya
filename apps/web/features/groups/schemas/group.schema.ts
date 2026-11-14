import { z } from "zod";

export const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(100, "이름은 100자 이내로 입력해 주세요."),
});
export type GroupInput = z.infer<typeof groupSchema>;
