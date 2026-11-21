import { z } from "zod";
const amount = z
  .string()
  .regex(/^\d+$/, "정수 원 단위로 입력해 주세요.")
  .refine((v) => Number(v) <= 2_000_000_000, "20억 원 이하로 입력해 주세요.");
export const expenseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "지출 이름을 입력해 주세요.")
    .max(100, "100자 이내로 입력해 주세요."),
  total: amount.refine((v) => Number(v) > 0, "전체 이용 금액을 입력해 주세요."),
  roundId: z.uuid("차수를 선택해 주세요."),
  deposit: z.union([z.literal(""), amount]),
  includeDeposit: z.boolean(),
  support: z.union([z.literal(""), amount]),
  reservationId: z.string(),
  memo: z.string().max(300, "300자 이내로 입력해 주세요."),
  payers: z.array(z.string()),
  remainder: z.string(),
  fileIds: z.array(z.string()),
});
export type ExpenseValues = z.infer<typeof expenseSchema>;
