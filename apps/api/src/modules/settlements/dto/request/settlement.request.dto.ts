import { IsObject } from "class-validator";
import { z } from "zod";
export class SettlementCommandInput {
  @IsObject() command!: Record<string, unknown>;
}
const amount = z.number().int().min(0).max(2_000_000_000);
const person = z
  .object({ id: z.uuid(), version: z.number().int().min(1) })
  .strict();
export const bankSchema = z
  .object({
    bank: z.string().trim().min(1).max(60),
    account: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[0-9 -]+$/),
    holder: z.string().trim().min(1).max(100),
  })
  .strict();
const base = { requestKey: z.uuid(), expectedVersion: z.number().int().min(0) };
export const expenseSchema = z
  .object({
    ...base,
    action: z.literal("EXPENSE"),
    id: z.uuid(),
    roundId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    total: amount.min(1),
    deposit: amount,
    includeDeposit: z.boolean(),
    support: amount,
    reservationId: z.uuid().nullable(),
    memo: z.string().max(300),
    payers: z.array(person).max(1000),
    remainder: person.nullable(),
    fileIds: z.array(z.uuid()).max(100),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("action", [
  expenseSchema,
  z
    .object({ ...base, action: z.literal("DELETE_EXPENSE"), id: z.uuid() })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("RECEIPT"),
      participantId: z.uuid(),
      amount: amount.min(1),
      calculationVersion: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("RETURN"),
      returnedAt: z.iso.datetime({ offset: true }),
      participantId: z.uuid(),
      amount: amount.min(1),
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("CORRECTION"),
      paymentId: z.uuid(),
      reason: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({ ...base, action: z.literal("MEMO"), memo: z.string().max(100) })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("FINALIZE_EVENT"),
      noExpenses: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("NOTICE"),
      replaces: z.uuid().nullable(),
      title: z.string().trim().min(1).max(100),
      message: z.string().max(300),
      bank: bankSchema.nullable(),
      saveBank: z.boolean(),
      deadline: z.iso.date().nullable(),
      includePeople: z.boolean(),
      scope: z.enum(["ALL", "UNCONFIRMED"]),
    })
    .strict(),
]);
export type SettlementInput = z.infer<typeof commandSchema>;
