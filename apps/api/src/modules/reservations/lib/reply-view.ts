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
        snapshot: {
          // Preserve the public DTO used by existing clients while storing each fact once.
          ...row.snapshot.requested,
          ...(row.snapshot.offered
            ? {
                startsAt: row.snapshot.offered.startsAt,
                expectedGuests: row.snapshot.offered.expectedGuests,
                space: row.snapshot.offered.space,
                seating: row.snapshot.offered.seating,
              }
            : {}),
          requested: row.snapshot.requested,
          offered: row.snapshot.offered,
        },
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
