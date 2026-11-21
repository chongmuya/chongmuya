import { z } from "zod";
import type { SessionRequest } from "@/features/auth/types";

const prefix = "/api/v1/account/withdrawal";
const statusSchema = z.object({
  blockers: z.array(
    z.enum([
      "OPEN_INQUIRY",
      "ACTIVE_RESERVATION",
      "GROUP_OWNER",
      "RESTAURANT_OWNER",
    ]),
  ),
  inquiries: z.number().int().nonnegative(),
  reservations: z.number().int().nonnegative(),
  destinations: z.array(
    z
      .string()
      .regex(
        /^(?:\/events\?event=[0-9a-f-]{36}&view=reservation|\/owner\/(?:inquiries\?target|reservations\?reservation)=[0-9a-f-]{36})$/i,
      ),
  ),
  request: z.object({ id: z.uuid(), reviewed: z.boolean() }).nullable(),
});
const receiptSchema = z.object({ completed: z.boolean() });
const completionSchema = z.discriminatedUnion("completed", [
  z.object({ completed: z.literal(true) }),
  statusSchema.extend({ completed: z.literal(false) }),
]);

export type WithdrawalStatus = z.infer<typeof statusSchema>;

function post(requestKey: string) {
  return { method: "POST", body: JSON.stringify({ requestKey }) };
}

export const withdrawalStatusQuery = (request: SessionRequest, id: string) => ({
  queryKey: ["user", id, "account", "withdrawal"],
  queryFn: async ({ signal }: { signal: AbortSignal }) =>
    statusSchema.parse(await request(prefix, { signal })),
  staleTime: 0,
  retry: false as const,
});

export async function requestWithdrawal(request: SessionRequest, key: string) {
  return statusSchema.parse(await request(`${prefix}/requests`, post(key)));
}

export async function completeWithdrawal(request: SessionRequest, key: string) {
  return completionSchema.parse(await request(`${prefix}/complete`, post(key)));
}

export async function withdrawalReceipt(request: SessionRequest, key: string) {
  return receiptSchema.parse(await request(`${prefix}/receipt`, post(key)));
}
