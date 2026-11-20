import { z } from "zod";
export const menuSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      quantity: z
        .number({ error: "수량을 입력해 주세요." })
        .int("수량은 정수로 입력해 주세요.")
        .min(0, "수량은 0 이상이어야 해요.")
        .max(100000, "수량은 100,000 이하여야 해요."),
    }),
  ),
  confirmed: z.boolean(),
  payer: z.string().trim().max(80),
  amount: z.string().trim(),
});
