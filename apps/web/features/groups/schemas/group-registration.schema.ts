import { z } from "zod";
import { groupSchema } from "./group.schema";
import { MAX_ROSTER_MEMBERS } from "../lib/parse-roster";

export const rosterRowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(100, "이름은 100자 이내로 입력해 주세요."),
  phoneLast4: z
    .string()
    .regex(/^(?:[0-9]{4})?$/, "뒤 4자리를 입력하거나 비워 주세요."),
  label: z.string().trim().max(40, "구분 표시는 40자 이내로 입력해 주세요."),
  match: z.string(),
  parseError: z.string().max(0, "해석되지 않은 행을 수정하거나 제외해 주세요."),
});
export const groupRegistrationSchema = groupSchema.extend({
  groupType: z
    .string()
    .trim()
    .max(40, "모임 유형은 40자 이내로 입력해 주세요."),
  source: z.string(),
  members: z
    .array(rosterRowSchema)
    .max(MAX_ROSTER_MEMBERS, "명단은 500명까지 등록할 수 있어요."),
});
export type GroupRegistrationValues = z.infer<typeof groupRegistrationSchema>;
