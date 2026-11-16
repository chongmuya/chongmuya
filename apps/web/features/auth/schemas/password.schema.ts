import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 8~16자로 입력해 주세요.")
  .max(16, "비밀번호는 8~16자로 입력해 주세요.")
  .regex(
    /^[\x21-\x7e]+$/,
    "공백 없이 영문·숫자·일반 특수문자만 사용할 수 있어요.",
  );

export const passwordFields = {
  password: passwordSchema,
  passwordConfirm: z.string().min(1, "비밀번호를 다시 입력해 주세요."),
};
export const passwordConfirmation = (value: {
  password: string;
  passwordConfirm: string;
}) => value.password === value.passwordConfirm;
export const passwordConfirmationError = {
  path: ["passwordConfirm"],
  message: "비밀번호가 일치하지 않아요.",
};
export const resetPasswordSchema = z
  .object(passwordFields)
  .refine(passwordConfirmation, passwordConfirmationError);
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
