import { z } from "zod";
export const recordsSchema = z.object({
  search: z.string().max(100, "100자 이내로 검색해 주세요."),
  after: z.string(),
  before: z.string(),
});
export type RecordsFilter = z.infer<typeof recordsSchema> & { offset: number };
