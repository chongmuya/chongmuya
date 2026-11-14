import { z } from "zod";

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "이메일은 254자 이내로 입력해 주세요.")
    .pipe(
      z.email({
        pattern: z.regexes.html5Email,
        error: "이메일을 확인해 주세요.",
      }),
    ),
  password: z
    .string()
    .min(12, "비밀번호는 12자 이상 입력해 주세요.")
    .max(128, "비밀번호는 128자 이내로 입력해 주세요."),
});
export type Credentials = z.infer<typeof credentialsSchema>;
