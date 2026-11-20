import { z } from "zod";
import type { InquirySnapshot } from "./inquiry.js";
export const deliveryStates = [
  "PENDING",
  "PROCESSING",
  "ACCEPTED",
  "DELIVERED",
  "FAILED",
  "UNKNOWN",
  "HELD",
  "CANCELLED",
] as const;
export type DeliveryState = (typeof deliveryStates)[number];
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
        minutes: z.number().int().min(1).max(1440).nullable(),
      })
      .strict()
      .refine((v) =>
        v.kind === "MINUTES" ? v.minutes !== null : v.minutes === null,
      )
      .optional(),
    minimumQuantity: z.number().int().min(0).max(100000).nullable().optional(),
    changeCancellationPolicy: z.string().trim().max(1500).nullable().optional(),
    note: z.string().max(1500),
  })
  .strict();
export const replySchema = z
  .object({
    requestKey: z.uuid(),
    expectedVersion: z.number().int().min(0),
    kind: z.enum(["AVAILABLE", "CHANGE", "DECLINE"]),
    // Former clients may still include a deadline. The service derives the stored value.
    proposal: proposalSchema.partial({ menuDeadlineAt: true }).nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    reason: z.string().max(1000),
    holdConfirmed: z.boolean(),
  })
  .strict();
export type MerchantReplyInput = z.infer<typeof replySchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type ReplySnapshot = {
  holdConfirmed?: boolean;
  offered: Proposal | null;
  requested: InquirySnapshot;
};
export type ReplyActor = {
  kind: "MERCHANT_LINK" | "OWNER_ACCOUNT" | "OPERATOR_RECORDED";
  id: string;
  method?: string;
  reason?: string;
  confirmedAt?: string;
};
