import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import type { InquirySnapshot } from "./types/inquiry.js";
import { replyView } from "./lib/reply-view.js";

const cursorSchema = z
  .object({ receivedAt: z.iso.datetime(), id: z.uuid() })
  .strict();
@Injectable()
export class MerchantInquiriesQuery {
  constructor(
    private readonly database: DatabaseService,
    private readonly restaurants: RestaurantsService,
  ) {}
  async list(user: AuthUser, cursor?: string) {
    if (user.accountType !== "owner")
      throw new DomainHttpException("OWNER_REQUIRED");
    let after: z.infer<typeof cursorSchema> | undefined;
    if (cursor) {
      try {
        if (cursor.length > 500 || !/^[A-Za-z0-9_-]+$/.test(cursor))
          throw new Error();
        after = cursorSchema.parse(
          JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new DomainHttpException("VALIDATION_FAILED");
      }
    }
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const ids = await this.restaurants.ownedIds(user.id, m);
      if (!ids.length) return { inquiries: [], nextCursor: null };
      const q = m
        .createQueryBuilder(RequestTarget, "t")
        .innerJoin(ReservationRequest, "r", "r.id = t.request_id")
        .leftJoin(
          MerchantReplyRevision,
          "p",
          "p.target_id = t.id AND p.revision = t.reply_version",
        )
        .leftJoin(
          SelectedReservation,
          "s",
          "s.request_id = t.request_id AND s.target_id = t.id",
        )
        .where("t.restaurant_id IN (:...ids)", { ids })
        .select([
          "t.id AS id",
          "t.restaurant_id AS restaurant_id",
          "t.restaurant_name AS restaurant_name",
          "t.candidate_state AS candidate_state",
          "s.id AS reservation_id",
          "r.snapshot AS snapshot",
          "r.closed_at AS closed_at",
          `to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_at`,
          "p.kind AS kind",
          "p.revision AS revision",
          "p.snapshot AS reply_snapshot",
          "p.reason AS reason",
          "p.expires_at AS expires_at",
          "p.created_at AS replied_at",
        ])
        .orderBy("r.created_at", "DESC")
        .addOrderBy("t.id", "DESC")
        .limit(21);
      if (after)
        q.andWhere(
          "(r.created_at, t.id) < (:receivedAt::timestamptz, :id::uuid)",
          after,
        );
      const rows = await q.getRawMany<{
        id: string;
        restaurant_id: string;
        restaurant_name: string;
        candidate_state: RequestTarget["candidateState"];
        reservation_id: string | null;
        snapshot: InquirySnapshot;
        closed_at: Date | null;
        received_at: string;
        kind: MerchantReplyRevision["kind"] | null;
        revision: number;
        reply_snapshot: MerchantReplyRevision["snapshot"];
        reason: string;
        expires_at: Date | null;
        replied_at: Date;
      }>();
      const page = rows.slice(0, 20),
        last = page.at(-1);
      return {
        inquiries: page.map((r) => ({
          targetId: r.id,
          restaurantId: r.restaurant_id,
          restaurantName: r.restaurant_name,
          eventName: r.snapshot.eventName,
          startsAt: r.snapshot.startsAt,
          expectedGuests: r.snapshot.expectedGuests,
          receivedAt: r.received_at,
          closed:
            !!r.closed_at ||
            r.candidate_state !== "OPEN" ||
            Date.parse(r.snapshot.startsAt) <= Date.now(),
          candidateState: r.candidate_state,
          reservationId: r.reservation_id,
          response: replyView(
            r.kind
              ? {
                  kind: r.kind,
                  revision: r.revision,
                  snapshot: r.reply_snapshot,
                  reason: r.reason,
                  expiresAt: r.expires_at,
                  createdAt: r.replied_at,
                }
              : null,
          ),
        })),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({ receivedAt: last.received_at, id: last.id }),
              ).toString("base64url")
            : null,
      };
    });
  }
}
