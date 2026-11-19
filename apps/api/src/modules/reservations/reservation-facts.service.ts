import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { EventsService } from "../events/events.service.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { ReservationProgress } from "./entities/reservation-progress.entity.js";
import {
  initialPreparation,
  completionStatus,
} from "./lib/reservation-completion.js";
@Injectable()
export class ReservationFactsService {
  constructor(
    private readonly events: EventsService,
    private readonly restaurants: RestaurantsService,
  ) {}
  async calendar(
    ownerId: string,
    restaurantId: string,
    from: Date,
    to: Date,
    m: EntityManager,
  ) {
    await this.restaurants.assertOwned(ownerId, restaurantId, m);
    const starts =
      "COALESCE(p.state->'agreement'->>'startsAt',s.snapshot->'offered'->>'startsAt',reply.snapshot->'offered'->>'startsAt',r.snapshot->>'startsAt')";
    const rows = await m
      .createQueryBuilder(RequestTarget, "t")
      .innerJoin(ReservationRequest, "r", "r.id=t.request_id")
      .leftJoin(SelectedReservation, "s", "s.target_id=t.id")
      .leftJoin(ReservationProgress, "p", "p.reservation_id=s.id")
      .leftJoin(
        MerchantReplyRevision,
        "reply",
        "reply.target_id=t.id AND reply.revision=t.reply_version",
      )
      .where("t.restaurant_id=:restaurantId", { restaurantId })
      .andWhere(
        `${starts}::timestamptz>=:from AND ${starts}::timestamptz<:to`,
        { from, to },
      )
      .select([
        "t.id AS id",
        "s.id AS reservation_id",
        "s.status AS status",
        "t.candidate_state AS candidate_state",
        "reply.expires_at AS expires_at",
        "reply.kind AS reply_kind",
        "r.snapshot->>'eventName' AS title",
        `${starts} AS starts_at`,
      ])
      .orderBy(`${starts}::timestamptz`, "ASC")
      .addOrderBy("t.id", "ASC")
      .getRawMany<{
        id: string;
        reservation_id: string | null;
        status: string | null;
        candidate_state: string;
        expires_at: Date | null;
        reply_kind: string | null;
        title: string;
        starts_at: string;
      }>();
    return rows.map((r) => ({
      id: r.id,
      reservationId: r.reservation_id,
      title: r.title,
      startsAt: r.starts_at,
      status:
        r.status ??
        (r.candidate_state !== "OPEN"
          ? r.candidate_state
          : r.expires_at && r.expires_at <= new Date()
            ? "EXPIRED"
            : ["AVAILABLE", "CHANGE"].includes(r.reply_kind ?? "")
              ? "OFFERED"
              : "INQUIRY"),
      destination: r.reservation_id
        ? `/owner/reservations?reservation=${r.reservation_id}`
        : `/owner/inquiries?target=${r.id}`,
    }));
  }
  async forEvent(ownerId: string, eventId: string, m: EntityManager) {
    await this.events.assertOwned(ownerId, eventId, m);
    const rows = await m.find(SelectedReservation, {
      where: { eventId },
      order: { selectedAt: "DESC" },
    });
    return Promise.all(
      rows.map(async (r) => {
        const s =
          (await m.findOneBy(ReservationProgress, { reservationId: r.id }))
            ?.state ?? initialPreparation(r);
        return {
          reservationId: r.id,
          restaurantName:
            (await m.findOneBy(RequestTarget, { id: r.targetId }))
              ?.restaurantName ?? null,
          eventId,
          status: r.status,
          progress: completionStatus(s),
          agreedStartsAt: s.agreement.startsAt,
          confirmedAt: s.confirmation?.at ?? null,
          cancelledAt: s.cancellation?.at ?? null,
          receivedAmount: s.receipt?.amount ?? 0,
          refundedAmount: s.refunded,
          remainingAmount: (s.receipt?.amount ?? 0) - s.refunded,
          refundExpected: s.refundExpected,
        };
      }),
    );
  }
}
