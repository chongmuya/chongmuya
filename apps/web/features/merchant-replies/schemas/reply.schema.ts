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
    usageTime: z
      .object({
        kind: z.enum(["UNKNOWN", "UNLIMITED", "MINUTES"]),
        minutes: z
          .number({ error: "이용 시간은 1~1,440분의 정수로 입력해 주세요." })
          .int({ error: "이용 시간은 정수로 입력해 주세요." })
          .min(1, "이용 시간은 1분 이상 입력해 주세요.")
          .max(1440, "이용 시간은 1,440분 이하로 입력해 주세요.")
          .nullable(),
      })
      .strict()
      .refine(
        (v) => (v.kind === "MINUTES" ? v.minutes !== null : v.minutes === null),
        { path: ["minutes"], message: "이용 시간을 확인해 주세요." },
      )
      .optional(),
    minimumQuantity: z
      .number({ error: "최소 주문 수량은 0~100,000의 정수로 입력해 주세요." })
      .int({ error: "최소 주문 수량은 정수로 입력해 주세요." })
      .min(0, "최소 주문 수량은 0 이상 입력해 주세요.")
      .max(100000, "최소 주문 수량은 100,000 이하로 입력해 주세요.")
      .nullable()
      .optional(),
    changeCancellationPolicy: z.string().trim().max(1500).nullable().optional(),
    note: z.string().max(1500),
  })
  .strict();
export function replyMenuDeadline(original: Proposal, startsAt: string) {
  if (!original.menuDeadlineAt) return null;
  const proposedStart = Date.parse(startsAt);
  if (!Number.isFinite(proposedStart)) return null;
  const offset =
    Date.parse(original.startsAt) - Date.parse(original.menuDeadlineAt);
  return proposedStart - offset;
}

export const replySchema = (original: Proposal) =>
  z
    .object({
      requestKey: z.uuid(),
      expectedVersion: z.number().int().min(0),
      kind: z.enum(["AVAILABLE", "CHANGE", "DECLINE"]),
      proposal: proposalSchema.omit({ menuDeadlineAt: true }).nullable(),
      expiresAt: z.iso.datetime({ offset: true }).nullable(),
      reason: z.string().max(1000),
      holdConfirmed: z.boolean(),
    })
    .strict()
    .superRefine((input, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: "custom", path, message });
      if (input.kind === "DECLINE") {
        if (!input.reason.trim())
          issue(["reason"], "불가 사유를 입력해 주세요.");
        if (input.proposal || input.expiresAt || input.holdConfirmed)
          issue(["reason"], "불가 답변에는 제안 조건을 보낼 수 없어요.");
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
            Date.parse(original.startsAt),
            replyMenuDeadline(original, p.startsAt) ?? Infinity,
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
      if (Date.parse(p.startsAt) <= Date.now())
        issue(["proposal", "startsAt"], "미래의 행사 일시를 입력해 주세요.");
      if (p.deposit.amount === null)
        issue(
          ["proposal", "deposit", "amount"],
          "예약금을 입력해 주세요. 없으면 0원을 입력해 주세요.",
        );
      if (
        input.kind === "AVAILABLE" &&
        (!p.usageTime || p.usageTime.kind === "UNKNOWN")
      )
        issue(
          ["proposal", "usageTime", "minutes"],
          "이용 시간을 입력하거나 자유롭게 이용 가능함을 선택해 주세요.",
        );
      if (
        input.kind === "CHANGE" &&
        !p.note.trim() &&
        p.expectedGuests === original.expectedGuests &&
        Date.parse(p.startsAt) === Date.parse(original.startsAt) &&
        p.space === original.space &&
        p.seating === original.seating &&
        p.minimumSpend === original.minimumSpend &&
        p.separateFee === original.separateFee &&
        p.deposit.kind === original.deposit.kind &&
        p.deposit.amount === original.deposit.amount &&
        (p.usageTime?.kind ?? "UNKNOWN") ===
          (original.usageTime?.kind ?? "UNKNOWN") &&
        (p.usageTime?.minutes ?? null) ===
          (original.usageTime?.minutes ?? null) &&
        (p.minimumQuantity ?? null) === (original.minimumQuantity ?? null) &&
        (p.changeCancellationPolicy ?? "") ===
          (original.changeCancellationPolicy ?? "")
      )
        issue(
          ["proposal", "note"],
          "바꿀 조건을 선택하거나 변경 내용을 입력해 주세요.",
        );
      if (
        p.deposit.kind === "FIXED" &&
        (!p.deposit.amount || p.deposit.amount <= 0)
      )
        issue(
          ["proposal", "deposit", "amount"],
          "확정 예약금을 입력해 주세요.",
        );
    });
export type MerchantReplyInput = z.infer<ReturnType<typeof replySchema>>;
export type Proposal = z.infer<typeof proposalSchema>;
