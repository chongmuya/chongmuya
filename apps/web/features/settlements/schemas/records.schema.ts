import { z } from "zod";
import { isDateOnly } from "@/shared/lib/korean-date";

const optionalDate = z.string().refine((value) => !value || isDateOnly(value), {
  message: "날짜를 다시 선택해 주세요.",
});

export const recordsSchema = z
  .object({
    search: z.string().max(100, "100자 이내로 검색해 주세요."),
    after: optionalDate,
    before: optionalDate,
  })
  .refine(({ after, before }) => !after || !before || after <= before, {
    path: ["before"],
    message: "종료 날짜는 시작 날짜 이후로 선택해 주세요.",
  });
export type RecordsFilter = z.infer<typeof recordsSchema> & { offset: number };
