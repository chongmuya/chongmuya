import { z } from "zod";
import type { Proposal } from "./merchant-reply.js";
import type { AuthUser } from "../../auth/types/auth-user.js";
export type ReservationPrincipal =
  | { kind: "organizer" | "owner"; user: AuthUser }
  | { kind: "link"; access?: string }
  | {
      kind: "operator";
      actor: string;
      confirmer: string;
      method: "PHONE" | "SMS";
      confirmedAt: string;
      reason: string;
    };
export type ReservationAudit = {
  kind: string;
  recorder: string;
  confirmer: string;
  method: string;
  confirmedAt: string;
  recordedAt: string;
  reason: string;
};
export type MenuLine = {
  id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  subtotal: number;
};
export type MenuOrder = {
  revision: number;
  catalogVersion: number;
  lines: MenuLine[];
  total: number;
  currency: "KRW";
  submittedAt: string;
};
export type DepositGuidance = {
  revision: number;
  kind: "UNKNOWN" | "NONE" | "REQUIRED";
  amount: number | null;
  deadline: string | null;
  channel: "WEB" | "SMS" | "PENDING";
  bank: string;
  account: string;
  holder: string;
  policy: string;
  issuedAt: string;
  audit: ReservationAudit | null;
};
export type MoneyReceipt = {
  id: string;
  guidanceRevision: number;
  amount: number;
  receivedAt: string;
  recordedAt: string;
  audit: ReservationAudit;
  corrects: string | null;
};
export type TransferReport = {
  guidanceRevision: number;
  payer: string;
  amount: number;
  reportedAt: string;
};
export type ReservationPreparation = {
  agreementRevision: number;
  agreement: Proposal;
  guidance: DepositGuidance;
  draft: {
    catalogVersion: number;
    items: { id: string; quantity: number }[];
  } | null;
  order: MenuOrder | null;
  acknowledgedRevision: number | null;
  acknowledgedAt: string | null;
  transfer: TransferReport | null;
  receipt: MoneyReceipt | null;
  exceptionResolution: {
    at: string;
    reason: string;
    audit: ReservationAudit;
  } | null;
  confirmation: {
    at: string;
    audit: ReservationAudit;
    agreement: Proposal;
    guidance: DepositGuidance;
    order: MenuOrder;
    receivedAmount: number;
  } | null;
  refundExpected: number | null;
  refunded: number;
  cancellation: { at: string; reason: string; audit: ReservationAudit } | null;
};
export const money = z.number().int().min(0).max(2_000_000_000);
export const commandSchema = z.object({
  requestKey: z.uuid(),
  expectedVersion: z.number().int().positive(),
});
export const itemsSchema = z
  .array(
    z
      .object({ id: z.uuid(), quantity: z.number().int().min(0).max(100000) })
      .strict(),
  )
  .max(200)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length);
export const menuCommand = commandSchema
  .extend({
    catalogVersion: z.number().int().positive(),
    items: itemsSchema,
    guidanceRevision: z.number().int().positive(),
    confirmed: z.literal(true),
    transfer: z
      .object({
        payer: z.string().trim().min(1).max(80),
        amount: money.positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const draftCommand = commandSchema
  .extend({ catalogVersion: z.number().int().positive(), items: itemsSchema })
  .strict();
export const guidanceCommand = commandSchema
  .extend({
    kind: z.enum(["NONE", "REQUIRED"]),
    amount: money,
    deadline: z.iso.datetime({ offset: true }).nullable(),
    channel: z.enum(["WEB", "SMS"]),
    bank: z.string().trim().max(80),
    account: z.string().trim().max(100),
    holder: z.string().trim().max(80),
    policy: z.string().trim().min(1).max(1500),
    webConsent: z.boolean(),
  })
  .strict();
export const transferCommand = commandSchema
  .extend({
    guidanceRevision: z.number().int().positive(),
    payer: z.string().trim().min(1).max(80),
    amount: money.positive(),
  })
  .strict();
export const receiptCommand = commandSchema
  .extend({
    guidanceRevision: z.number().int().positive(),
    amount: money,
    receivedAt: z.iso.datetime({ offset: true }),
    corrects: z.uuid().nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const acknowledgeCommand = commandSchema
  .extend({
    guidanceRevision: z.number().int().positive(),
    confirmed: z.literal(true),
  })
  .strict();
export const resolveCommand = commandSchema
  .extend({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const changeCommand = commandSchema
  .extend({
    kind: z.enum(["CHANGE", "CANCEL"]),
    subject: z.enum(["SCHEDULE", "GUESTS", "MENU", "OTHER"]),
    reason: z.string().trim().min(1).max(100),
  })
  .strict();
export const refundCommand = commandSchema
  .extend({
    amount: money.positive(),
    refundedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type RefundFact = {
  amount: number;
  refundedAt: string;
  expected: number | null;
  totalReturned: number;
  variance: number | null;
};
