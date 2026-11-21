import { z } from "zod";
export const handoverSchema = z.object({
  targetId: z.uuid("인수할 계정 멤버를 선택해 주세요."),
});
