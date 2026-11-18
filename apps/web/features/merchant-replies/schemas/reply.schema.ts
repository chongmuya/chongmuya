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
  .strict();
export type MerchantReplyInput = z.infer<typeof replySchema>;
export type Proposal = z.infer<typeof proposalSchema>;
