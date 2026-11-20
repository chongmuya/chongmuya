import { z } from "zod";

export const guestCountSchema = z
  .string()
  .regex(/^[1-9]\d{0,5}$/, "1명 이상의 정수로 입력해 주세요.")
  .refine(
    (value) => Number(value) <= 100000,
    "100,000명 이하로 입력해 주세요.",
  );
