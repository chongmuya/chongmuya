import { candidateState } from "./lib/candidate-state.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import type { ReservationPreparation } from "./types/reservation-completion.js";
import { Injectable } from "@nestjs/common";
import { In, type EntityManager } from "typeorm";
import { EventsService } from "../events/events.service.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { ReservationProgress } from "./entities/reservation-progress.entity.js";
import {
  initialPreparation,
  completionStatus,
  completionIssues,
} from "./lib/reservation-completion.js";
@Injectable()
export class ReservationFactsService {
  constructor(
    private readonly events: EventsService,
    private readonly restaurants: RestaurantsService,
  ) {}
  // The aggregate reader checks event ownership in this same transaction.
  // Read current reservation facts in batches; contact and bank details never leave it.
  async forEvents(ownerId: string, eventIds: string[], m: EntityManager) {
    if (!eventIds.length) return [];
    const requests = await m.find(ReservationRequest, {
      where: { eventId: In(eventIds), currentContactAccountId: ownerId },
      select: {
        id: true,
        eventId: true,
        round: true,
        state: true,
        snapshot: true,
      },
      order: { round: "DESC" },
    });
    const requestIds = requests.map((r) => r.id);
    const latestRequests = new Map<string, (typeof requests)[number]>();
    for (const request of requests)
      if (!latestRequests.has(request.eventId))
        latestRequests.set(request.eventId, request);
    const selected = requestIds.length
      ? await m.find(SelectedReservation, {
          where: { eventId: In(eventIds), requestId: In(requestIds) },
          order: { selectedAt: "DESC", id: "DESC" },
        })
      : [];
    const progress = selected.length
      ? await m.findBy(ReservationProgress, {
          reservationId: In(selected.map((s) => s.id)),
        })
      : [];
    const states = new Map(progress.map((p) => [p.reservationId, p.state]));
    const targetRequestIds = [
      ...new Set([
        ...[...latestRequests.values()].map((r) => r.id),
        ...selected.map((s) => s.requestId),
      ]),
    ];
    const targets = targetRequestIds.length
      ? await m
          .createQueryBuilder(RequestTarget, "t")
          .leftJoin(
            MerchantReplyRevision,
            "reply",
            "reply.target_id=t.id AND reply.revision=t.reply_version",
          )
          .where("t.request_id IN (:...ids)", { ids: targetRequestIds })
          .select([
            't.id AS "id"',
            't.request_id AS "requestId"',
            't.restaurant_name AS "restaurantName"',
            't.candidate_state AS "candidateState"',
            'reply.kind AS "kind"',
            'reply.expires_at AS "expiresAt"',
          ])
          .getRawMany<{
            id: string;
            requestId: string;
            restaurantName: string;
            candidateState: RequestTarget["candidateState"];
            kind: MerchantReplyRevision["kind"] | null;
            expiresAt: Date | null;
          }>()
      : [];
    const now = new Date();
    return eventIds.map((eventId) => {
      const request = latestRequests.get(eventId);
      const selection =
        selected.find((s) => s.eventId === eventId && !s.cancelledAt) ??
        selected.find((s) => s.requestId === request?.id);
      const state = selection
        ? (states.get(selection.id) ?? initialPreparation(selection))
        : null;
      const selectionRequest = selection
        ? requests.find((r) => r.id === selection.requestId)
        : null;
      const candidateStates = request
        ? targets
            .filter((target) => target.requestId === request.id)
            .map((target) =>
              candidateState(
                target,
                target.kind
                  ? {
                      kind: target.kind,
                      expiresAt: target.expiresAt
                        ? new Date(target.expiresAt)
                        : null,
                    }
                  : null,
                now,
              ),
            )
        : [];
      const inquiryState =
        request?.state !== "ACTIVE"
          ? ("CLOSED" as const)
          : candidateStates.includes("PROPOSED")
            ? ("REPLIES_RECEIVED" as const)
            : candidateStates.includes("AWAITING_REPLY")
              ? ("AWAITING_REPLY" as const)
              : ("CLOSED" as const);
      return {
        eventId,
        expectedGuests:
          state?.agreement.expectedGuests ??
          request?.snapshot.expectedGuests ??
          null,
        region:
          selectionRequest?.snapshot.region ?? request?.snapshot.region ?? null,
        inquiry: request
          ? { requestId: request.id, state: inquiryState }
          : null,
        reservation:
          selection && state
            ? {
                reservationId: selection.id,
                status: selection.status,
                progress: completionStatus(state, now.getTime()),
                refundedAmount: state.refunded,
                restaurantName:
                  targets.find((t) => t.id === selection.targetId)
                    ?.restaurantName ?? null,
                startsAt: state.agreement.startsAt,
              }
            : null,
      };
    });
  }
  async calendar(
    ownerId: string,
    restaurantId: string,
    from: Date,
    to: Date,
    m: EntityManager,
    now = Date.now(),
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
        "s.snapshot AS selection_snapshot",
        "s.selected_at AS selected_at",
        "p.state AS preparation",
        "t.candidate_state AS candidate_state",
        "reply.expires_at AS expires_at",
        "reply.kind AS reply_kind",
        "r.snapshot->>'eventName' AS title",
        "COALESCE(p.state->'agreement'->>'expectedGuests',s.snapshot->'offered'->>'expectedGuests',reply.snapshot->'offered'->>'expectedGuests',r.snapshot->>'expectedGuests')::integer AS guests",
        "r.snapshot->>'region' AS region",
        "r.snapshot->>'budgetBasis' AS budget_basis",
        "(r.snapshot->>'budgetAmount')::integer AS budget_amount",
        "(p.state->'order'->>'total')::integer AS order_total",
        "(p.state->'guidance'->>'amount')::integer AS deposit_amount",
        `${starts} AS starts_at`,
      ])
      .orderBy(`${starts}::timestamptz`, "ASC")
      .addOrderBy("t.id", "ASC")
      .getRawMany<{
        id: string;
        reservation_id: string | null;
        status: string | null;
        selection_snapshot: SelectedReservation["snapshot"] | null;
        selected_at: Date | null;
        preparation: ReservationPreparation | null;
        candidate_state: RequestTarget["candidateState"];
        expires_at: Date | null;
        reply_kind: MerchantReplyRevision["kind"] | null;
        title: string;
        guests: number;
        region: string | null;
        budget_basis: "PER_PERSON" | "TOTAL" | null;
        budget_amount: number | null;
        order_total: number | null;
        deposit_amount: number | null;
        starts_at: string;
      }>();
    return rows.map((r) => {
      const preparation =
        r.preparation ??
        (r.selection_snapshot?.offered && r.selected_at
          ? initialPreparation({
              snapshot: r.selection_snapshot,
              selectedAt: new Date(r.selected_at),
            } as SelectedReservation)
          : null);
      const lifecycle = candidateState(
        { candidateState: r.candidate_state },
        r.reply_kind ? { kind: r.reply_kind, expiresAt: r.expires_at } : null,
        new Date(now),
      );
      return {
        id: r.id,
        reservationId: r.reservation_id,
        progress: preparation ? completionStatus(preparation, now) : null,
        issueCodes: preparation ? completionIssues(preparation, now) : [],
        title: r.title,
        expectedGuests: r.guests,
        region: r.region,
        budgetBasis: r.budget_basis,
        budgetAmount: r.budget_amount,
        orderTotal: r.order_total,
        depositAmount: r.deposit_amount,
        startsAt: r.starts_at,
        status:
          r.status ??
          (lifecycle === "PROPOSED"
            ? "OFFERED"
            : lifecycle === "AWAITING_REPLY"
              ? "INQUIRY"
              : lifecycle),
        destination: r.reservation_id
          ? `/owner/reservations?reservation=${r.reservation_id}`
          : `/owner/inquiries?target=${r.id}`,
      };
    });
  }

  async calendarPlaces(ownerId: string, eventIds: string[], m: EntityManager) {
    if (!eventIds.length) return [];
    return m
      .createQueryBuilder(SelectedReservation, "s")
      .innerJoin(ReservationRequest, "r", "r.id=s.request_id")
      .innerJoin(RequestTarget, "t", "t.id=s.target_id")
      .where("s.event_id IN (:...eventIds) AND s.cancelled_at IS NULL", {
        eventIds,
      })
      .andWhere("r.current_contact_account_id=:ownerId", { ownerId })
      .select([
        's.event_id AS "eventId"',
        't.restaurant_name AS "restaurantName"',
      ])
      .getRawMany<{ eventId: string; restaurantName: string }>();
  }

  async forEvent(ownerId: string, eventId: string, m: EntityManager) {
    await this.events.assertOwned(ownerId, eventId, m);
    const rows = await m.find(SelectedReservation, {
      where: { eventId },
      order: { selectedAt: "DESC" },
    });
    const now = Date.now();
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
          progress: completionStatus(s, now),
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

  async depositBalances(reservationIds: string[], m: EntityManager) {
    if (!reservationIds.length) return [];
    const rows = await m.findBy(ReservationProgress, {
      reservationId: In(reservationIds),
    });
    return rows.map(({ reservationId, state }) => ({
      reservationId,
      remainingAmount: (state.receipt?.amount ?? 0) - state.refunded,
    }));
  }
}
