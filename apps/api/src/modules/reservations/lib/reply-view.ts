import type { MerchantReplyRevision } from "../entities/merchant-reply.entity.js";
export function replyView(
  row: Pick<
    MerchantReplyRevision,
    "kind" | "revision" | "snapshot" | "reason" | "createdAt" | "expiresAt"
  > | null,
) {
  return row
    ? {
        kind: row.kind,
        revision: row.revision,
        snapshot: row.snapshot,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        state:
          row.kind === "DECLINE"
            ? "DECLINED"
            : row.expiresAt && row.expiresAt.getTime() <= Date.now()
              ? "EXPIRED"
              : "PROPOSED",
      }
    : null;
}
