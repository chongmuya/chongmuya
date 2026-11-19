import { z } from "zod";
export const noticeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(100, "100자 이내로 입력해 주세요."),
  message: z.string().max(300, "300자 이내로 입력해 주세요."),
  bank: z.string().max(60),
  account: z
    .string()
    .max(60)
    .regex(/^[0-9 -]*$/, "계좌번호를 확인해 주세요."),
  holder: z.string().max(100),
  deadline: z.string(),
  saveBank: z.boolean(),
  includePeople: z.boolean(),
  scope: z.enum(["ALL", "UNCONFIRMED"]),
});
export type NoticeValues = z.infer<typeof noticeSchema>;
