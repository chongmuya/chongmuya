import { z } from "zod";

export const proposalSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    expectedGuests: z.number().int().positive().max(100000),
    space: z.enum(["ANY", "HALL", "ROOM", "FLOOR", "WHOLE"]),
    seating: z.enum(["ANY", "CLOSE", "SEPARATED"]),
    minimumSpend: z.number().int().min(0).max(2_000_000_000).nullable(),
    separateFee: z.number().int().min(0).max(2_000_000_000).nullable(),
    deposit: z
      .object({
        kind: z.enum(["NONE", "FIXED", "PER_RESERVATION", "UNKNOWN"]),
        amount: z.number().int().min(0).max(2_000_000_000).nullable(),
      })
      .strict(),
    menuDeadlineAt: z.iso.datetime({ offset: true }).nullable(),
    note: z.string().max(1500),
  })
  .strict();
export const replySchema = z
  .object({
    requestKey: z.uuid(),
    expectedVersion: z.number().int().min(0),
    kind: z.enum(["AVAILABLE", "CHANGE", "DECLINE"]),
    proposal: proposalSchema.nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    reason: z.string().max(1000),
    holdConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (input.kind === "DECLINE") {
      if (!input.reason.trim()) issue(["reason"], "불가 사유를 입력해 주세요.");
      return;
    }
    const p = input.proposal;
    if (!p) {
      issue(["proposal"], "제안 조건을 입력해 주세요.");
      return;
    }
    if (
      !input.expiresAt ||
      Date.parse(input.expiresAt) <= Date.now() ||
      Date.parse(input.expiresAt) >
        Math.min(
          Date.parse(p.startsAt),
          p.menuDeadlineAt ? Date.parse(p.menuDeadlineAt) : Infinity,
        )
    )
      issue(
        ["expiresAt"],
        "현재 시각 이후, 행사 시작과 메뉴 확정 이전의 기한을 입력해 주세요.",
      );
    if (!input.holdConfirmed)
      issue(
        ["holdConfirmed"],
        "선택 기한까지 좌석 유지가 가능한지 확인해 주세요.",
      );
    if (input.kind === "CHANGE" && !p.note.trim())
      issue(["proposal", "note"], "변경한 조건을 설명해 주세요.");
    if (
      p.deposit.kind === "FIXED" &&
      (!p.deposit.amount || p.deposit.amount <= 0)
    )
      issue(["proposal", "deposit", "amount"], "확정 예약금을 입력해 주세요.");
    if (
      p.menuDeadlineAt &&
      Date.parse(p.menuDeadlineAt) > Date.parse(p.startsAt)
    )
      issue(
        ["proposal", "menuDeadlineAt"],
        "행사 시작 이전의 메뉴 확정 기한을 입력해 주세요.",
      );
  });
export type MerchantReplyInput = z.infer<typeof replySchema>;
export type Proposal = z.infer<typeof proposalSchema>;
