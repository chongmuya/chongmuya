import { z } from "zod";
import {
  passwordFields,
  passwordConfirmation,
  passwordConfirmationError,
} from "./password.schema";

export const signupEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email("올바른 이메일 형식이 아니에요.")
      .max(254, "이메일은 254자 이내로 입력해 주세요."),
  );
const requiredConsent = z
  .boolean()
  .refine(Boolean, "필수 약관에 동의해 주세요.");
export const signupSchema = z
  .object({
    serviceTerms: requiredConsent,
    privacyCollection: requiredConsent,
    marketing: z.boolean(),
    email: signupEmailSchema,
    name: z
      .string()
      .max(100, "이름은 100자 이내로 입력해 주세요.")
      .refine((value) => value.trim().length > 0, "이름을 입력해 주세요."),
    ...passwordFields,
    phone: z
      .string()
      .regex(
        /^010\d{8}$/,
        "010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.",
      ),
  })
  .refine(passwordConfirmation, passwordConfirmationError);
export const kakaoSignupSchema = signupSchema.safeExtend({
  password: z.string().max(0),
  passwordConfirm: z.string().max(0),
});
export type SignupValues = z.infer<typeof signupSchema>;
export const signupDefaults: SignupValues = {
  serviceTerms: false,
  privacyCollection: false,
  marketing: false,
  email: "",
  name: "",
  password: "",
  passwordConfirm: "",
  phone: "",
};
export const signupStepFields = {
  terms: ["serviceTerms", "privacyCollection", "marketing"],
  information: ["email", "name", "password", "passwordConfirm", "phone"],
} as const satisfies Record<string, readonly (keyof SignupValues)[]>;
export type SignupStep = keyof typeof signupStepFields;
