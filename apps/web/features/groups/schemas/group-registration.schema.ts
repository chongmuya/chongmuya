import { z } from "zod";
import { groupSchema, groupTypeSchema } from "./group.schema";
export const groupRegistrationSchema = groupSchema.extend({
  groupType: groupTypeSchema,
});
export type GroupRegistrationValues = z.infer<typeof groupRegistrationSchema>;
