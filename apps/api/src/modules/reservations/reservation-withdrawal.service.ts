import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { EventsService } from "../events/events.service.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import {
  ReservationChange,
  ReservationProgress,
} from "./entities/reservation-progress.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { candidateState } from "./lib/candidate-state.js";

@Injectable()
export class ReservationWithdrawalService {
  constructor(private readonly events: EventsService) {}

  async blockers(accountId: string, m: EntityManager, restaurantIds: string[]) {
    const eventIds = await this.events.ownedIds(accountId, m);
    const ownedEvents = new Set(eventIds);
    const ownedRestaurants = new Set(restaurantIds);
    const context = {
      accountId,
      now: new Date(),
      eventIds,
      restaurantIds,
    };
    const ownsEvent = eventIds.length
      ? "r.event_id IN (:...eventIds)"
      : "false";
    const ownsRestaurant = restaurantIds.length
      ? "t.restaurant_id IN (:...restaurantIds)"
      : "false";
    const scope = `(${ownsEvent} OR r.current_contact_account_id = :accountId OR ${ownsRestaurant})`;
    const requests = await m
      .createQueryBuilder(ReservationRequest, "r")
      .innerJoin(RequestTarget, "t", "t.request_id = r.id")
      .leftJoin(
        MerchantReplyRevision,
        "reply",
        "reply.target_id = t.id AND reply.revision = t.reply_version",
      )
      .where(scope, context)
      .andWhere("r.state = 'ACTIVE' AND t.candidate_state = 'OPEN'")
      .andWhere(
        `COALESCE(reply.snapshot->'offered'->>'startsAt', r.snapshot->>'startsAt')::timestamptz > :now`,
      )
      .select([
        'r.id AS "requestId"',
        'r.event_id AS "eventId"',
        't.id AS "targetId"',
        't.restaurant_id AS "restaurantId"',
        't.candidate_state AS "candidateState"',
        'reply.kind AS "kind"',
        'reply.expires_at AS "expiresAt"',
      ])
      .orderBy("r.id")
      .addOrderBy("t.id")
      .getRawMany<{
        requestId: string;
        eventId: string;
        targetId: string;
        restaurantId: string;
        candidateState: RequestTarget["candidateState"];
        kind: MerchantReplyRevision["kind"] | null;
        expiresAt: Date | null;
      }>();
    const agreement = "COALESCE(p.state->'agreement', s.snapshot->'offered')";
    const startsAt = `COALESCE(${agreement}->>'startsAt', r.snapshot->>'startsAt')::timestamptz`;
    const minutes = `COALESCE((${agreement}->'usageTime'->>'minutes')::integer, 0)`;
    const selected = await m
      .createQueryBuilder(SelectedReservation, "s")
      .innerJoin(ReservationRequest, "r", "r.id = s.request_id")
      .innerJoin(RequestTarget, "t", "t.id = s.target_id")
      .leftJoin(ReservationProgress, "p", "p.reservation_id = s.id")
      .leftJoin(
        ReservationChange,
        "c",
        "c.reservation_id = s.id AND c.kind = 'CHANGE' AND c.status = 'PROPOSED'",
      )
      .where(scope, context)
      .andWhere(
        "s.cancelled_at IS NULL AND s.status IN ('PREPARING', 'CHECK_REQUIRED', 'CONFIRMED')",
      )
      .andWhere(
        `(${startsAt} + ${minutes} * interval '1 minute' > :now
          OR (c.proposal->'agreement'->>'startsAt')::timestamptz > :now)`,
      )
      .select([
        "s.id AS id",
        'r.event_id AS "eventId"',
        't.restaurant_id AS "restaurantId"',
      ])
      .orderBy("s.id")
      .getRawMany<{ id: string; eventId: string; restaurantId: string }>();
    const inquiries = new Map<string, string | null>();
    for (const row of requests) {
      const state = candidateState(
        row,
        row.kind ? { kind: row.kind, expiresAt: row.expiresAt } : null,
        context.now,
      );
      if (state !== "AWAITING_REPLY" && state !== "PROPOSED") continue;
      const href = ownedEvents.has(row.eventId)
        ? `/events?event=${row.eventId}&view=reservation`
        : ownedRestaurants.has(row.restaurantId)
          ? `/owner/inquiries?target=${row.targetId}`
          : null;
      if (!inquiries.get(row.requestId)) inquiries.set(row.requestId, href);
    }
    return {
      inquiries: [...inquiries.values()],
      reservations: selected.map((row) =>
        ownedEvents.has(row.eventId)
          ? `/events?event=${row.eventId}&view=reservation`
          : ownedRestaurants.has(row.restaurantId)
            ? `/owner/reservations?reservation=${row.id}`
            : null,
      ),
    };
  }
}
