import { z } from "zod";
import { groupSchema } from "./group.schema";
export const groupRegistrationSchema = groupSchema.extend({
  groupType: z
    .string()
    .trim()
    .max(40, "모임 유형은 40자 이내로 입력해 주세요."),
});
export type GroupRegistrationValues = z.infer<typeof groupRegistrationSchema>;
