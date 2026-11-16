import { z } from "zod";
import {
  passwordFields,
  passwordConfirmation,
  passwordConfirmationError,
} from "./password.schema";

export const signupEmailSchema = z
  .email("올바른 이메일 형식이 아니에요.")
  .max(254, "이메일은 254자 이내로 입력해 주세요.");
const requiredConsent = z
  .boolean()
  .refine(Boolean, "필수 약관에 동의해 주세요.");
export const signupSchema = z
  .object({
    serviceTerms: requiredConsent,
    privacyCollection: requiredConsent,
    privacyPolicy: requiredConsent,
    marketing: z.boolean(),
    email: signupEmailSchema,
    name: z
      .string()
      .refine((value) => value.trim().length > 0, "이름을 입력해 주세요."),
    ...passwordFields,
    phone: z
      .string()
      .refine((value) => value.trim().length > 0, "전화번호를 입력해 주세요."),
    nickname: z
      .string()
      .refine((value) => value.trim().length > 0, "닉네임을 입력해 주세요."),
  })
  .refine(passwordConfirmation, passwordConfirmationError);
export type SignupValues = z.infer<typeof signupSchema>;
export const signupDefaults: SignupValues = {
  serviceTerms: false,
  privacyCollection: false,
  privacyPolicy: false,
  marketing: false,
  email: "",
  name: "",
  password: "",
  passwordConfirm: "",
  phone: "",
  nickname: "",
};
export const signupStepFields = {
  terms: ["serviceTerms", "privacyCollection", "privacyPolicy", "marketing"],
  information: ["email", "name", "password", "passwordConfirm", "phone"],
  nickname: ["nickname"],
} as const satisfies Record<string, readonly (keyof SignupValues)[]>;
export type SignupStep = keyof typeof signupStepFields;
