import { isDeepStrictEqual } from "node:util";
import type { MerchantReplyRevision } from "../entities/merchant-reply.entity.js";

function replyTerms(reply: MerchantReplyRevision) {
  const p = reply.snapshot.offered;
  if (reply.kind === "DECLINE" || !p) return null;
  return [
    Date.parse(p.startsAt),
    p.expectedGuests,
    p.space,
    p.seating,
    p.minimumSpend,
    p.minimumQuantity ?? null,
    p.deposit.kind,
    p.deposit.amount,
    reply.expiresAt?.getTime(),
  ];
}

export function materiallyChangedReply(
  before: MerchantReplyRevision | null,
  after: MerchantReplyRevision,
) {
  return !before || !isDeepStrictEqual(replyTerms(before), replyTerms(after));
}

export function heldSeats(reply: MerchantReplyRevision | null, closedAt: Date) {
  return (
    !!reply &&
    reply.kind !== "DECLINE" &&
    !!reply.snapshot.offered &&
    reply.snapshot.holdConfirmed === true &&
    !!reply.expiresAt &&
    reply.expiresAt > closedAt
  );
}
