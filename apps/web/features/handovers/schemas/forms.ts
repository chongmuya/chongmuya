import { z } from "zod";
export const invitationSchema = z.object({
  email: z
    .email("초대할 계정의 인증된 이메일을 입력해 주세요.")
    .trim()
    .toLowerCase(),
});
export const handoverSchema = z.object({
  targetId: z.uuid("인수할 계정 멤버를 선택해 주세요."),
});
