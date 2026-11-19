import type { RequestTarget } from "../entities/request-target.entity.js";
import type { MerchantReplyRevision } from "../entities/merchant-reply.entity.js";
export function candidateState(
  target: RequestTarget,
  reply: MerchantReplyRevision | null,
  now: Date,
) {
  if (target.candidateState !== "OPEN") return target.candidateState;
  if (!reply) return "AWAITING_REPLY" as const;
  if (reply.kind === "DECLINE") return "MERCHANT_DECLINED" as const;
  if (!reply.expiresAt || reply.expiresAt.getTime() <= now.getTime())
    return "EXPIRED" as const;
  return "PROPOSED" as const;
}
export function terminalCandidate(state: ReturnType<typeof candidateState>) {
  return [
    "MERCHANT_DECLINED",
    "ORGANIZER_DECLINED",
    "EXPIRED",
    "OPERATOR_CLOSED",
    "OTHER_SELECTED",
  ].includes(state);
}
