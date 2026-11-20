import { z } from "zod";
import { personFields, rosterRowSchema } from "@/features/roster/client";

export const importGroupSchema = z
  .object({
    members: z
      .array(z.object({ id: z.uuid(), version: z.number().int().min(1) }))
      .max(500, "한 번에 500명까지 선택할 수 있어요."),
    directMembers: z
      .array(rosterRowSchema)
      .max(500, "명단은 500명까지 등록할 수 있어요."),
  })
  .refine((value) => value.members.length + value.directMembers.length > 0, {
    path: ["members"],
    message: "모임 명단을 선택하거나 직접 입력해 주세요.",
  });
export type ImportGroupInput = z.infer<typeof importGroupSchema>;
export const importDirectSchema = z.object(personFields);
export type ImportDirectInput = z.infer<typeof importDirectSchema>;
