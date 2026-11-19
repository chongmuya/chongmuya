import { z } from "zod";
export const profileSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(100),
  nickname: z.string().trim().max(100),
});
export const phoneSchema = z.object({
  phone: z
    .string()
    .regex(
      /^01[016789]\d{7,8}$/,
      "휴대폰 번호 10~11자리를 숫자로 입력해 주세요.",
    ),
});
