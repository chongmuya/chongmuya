import { z } from "zod";
import {
  isPersonName,
  normalizeName,
  phoneSuffix,
  MAX_ROSTER_MEMBERS,
} from "../lib/parse-roster";
export const personFields = {
  name: z
    .string()
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(1, "이름을 입력해 주세요.")
        .max(100, "이름은 100자 이내로 입력해 주세요.")
        .refine(
          isPersonName,
          "이름에 전화번호를 넣을 수 없어요. 이름을 확인해 주세요.",
        ),
    ),
  phoneLast4: z
    .string()
    .transform(phoneSuffix)
    .pipe(
      z.string().regex(/^(?:[0-9]{4})?$/, "뒤 4자리를 입력하거나 비워 주세요."),
    ),
  label: z.string().trim().max(40, "구분 표시는 40자 이내로 입력해 주세요."),
};
export const rosterRowSchema = z.object({
  ...personFields,
  match: z.string(),
  parseError: z.string().max(0, "해석되지 않은 행을 수정하거나 제외해 주세요."),
});
export const rosterSchema = z.object({
  source: z.string(),
  members: z
    .array(rosterRowSchema)
    .min(1, "명단에 구성원을 추가해 주세요.")
    .max(MAX_ROSTER_MEMBERS, "명단은 500명까지 등록할 수 있어요."),
});
export type RosterDraft = z.infer<typeof rosterSchema>;
