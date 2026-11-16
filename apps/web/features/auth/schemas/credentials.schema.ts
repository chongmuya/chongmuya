import { z } from "zod";
import { passwordSchema } from "./password.schema";

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
  password: passwordSchema,
});
export type Credentials = z.infer<typeof credentialsSchema>;
