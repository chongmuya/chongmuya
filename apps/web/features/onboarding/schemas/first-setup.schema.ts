import { z } from "zod";
export const roleSchema = z.object({
  accountType: z
    .enum(["", "organizer", "owner"])
    .refine((value): boolean => value !== "", "이용 유형을 선택해 주세요."),
});
export const nicknameSchema = z.object({
  nickname: z
    .string()
    .max(100, "닉네임은 100자 이내로 입력해 주세요.")
    .refine((value) => value.trim().length > 0, "닉네임을 입력해 주세요."),
});
export type RoleValues = z.infer<typeof roleSchema>;
