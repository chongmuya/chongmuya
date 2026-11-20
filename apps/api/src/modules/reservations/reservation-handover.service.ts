import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { ReservationProgress } from "./entities/reservation-progress.entity.js";
import { candidateState, terminalCandidate } from "./lib/candidate-state.js";
import { Injectable } from "@nestjs/common";
import { In, type EntityManager } from "typeorm";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { NotificationInput } from "../notifications/types/notification.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { ReservationNotificationsService } from "./reservation-notifications.service.js";
@Injectable()
export class ReservationHandoverService {
  constructor(
    private readonly notices: NotificationsService,
    private readonly restaurants: RestaurantsService,
    private readonly sender: ReservationNotificationsService,
  ) {}
  async ongoing(events: string[], m: EntityManager) {
    if (!events.length) return { ongoingReservations: 0, ongoingInquiries: 0 };
    const now = new Date();
    const selections = await m.findBy(SelectedReservation, {
      eventId: In(events),
    });
    let ongoingReservations = 0;
    for (const selection of selections) {
      if (selection.cancelledAt || selection.status === "CANCELLED") continue;
      if (selection.status === "CONFIRMED") {
        const progress = await m.findOneBy(ReservationProgress, {
          reservationId: selection.id,
        });
        const startsAt =
          progress?.state.agreement.startsAt ??
          selection.snapshot.offered?.startsAt;
        if (startsAt && new Date(startsAt) < now) continue;
      }
      ongoingReservations++;
    }
    let ongoingInquiries = 0;
    const requests = await m.findBy(ReservationRequest, {
      eventId: In(events),
      state: "ACTIVE",
    });
    for (const request of requests) {
      const targets = await m.findBy(RequestTarget, { requestId: request.id });
      for (const target of targets) {
        const reply = await m.findOneBy(MerchantReplyRevision, {
          targetId: target.id,
          revision: target.replyVersion,
        });
        if (!terminalCandidate(candidateState(target, reply, now))) {
          ongoingInquiries++;
          break;
        }
      }
    }
    return { ongoingReservations, ongoingInquiries };
  }

  // Caller already holds group and every event lock, in sorted order.
  async transfer(
    events: string[],
    from: string,
    to: { id: string; name: string; phone: string },
    handoverId: string,
    m: EntityManager,
  ) {
    if (!events.length) return [];
    const rows = await m.find(ReservationRequest, {
      where: { eventId: In(events) },
      order: { id: "ASC" },
      lock: { mode: "pessimistic_write" },
    });
    const notifications: NotificationInput[] = [];
    for (const r of rows) {
      const at = new Date().toISOString();
      r.contactChanges = [
        ...r.contactChanges,
        {
          handoverId,
          from: r.currentContactAccountId ?? from,
          to: to.id,
          name: to.name,
          at,
          actor: to.id,
        },
      ];
      r.currentContactAccountId = to.id;
      r.currentContactName = to.name;
      r.currentContactPhone = to.phone;
      r.version++;
      await m.save(r);
      await this.notices.replanOrganizer(r.id, from, to, to.id, handoverId, m);
      const targets = await m.find(RequestTarget, {
        where: { requestId: r.id },
        order: { id: "ASC" },
      });
      const accounts: {
        id: string;
        title: string;
        summary: string;
        destination: string;
      }[] = [];
      for (const t of targets) {
        const id = await this.restaurants.notificationAccount(
          t.restaurantId,
          m,
        );
        if (id && !accounts.some((a) => a.id === id))
          accounts.push({
            id,
            title: "모임 담당자가 변경됐어요",
            summary:
              "기존 문의·예약 기록은 유지돼요. 현재 담당자를 확인해 주세요.",
            destination: `/owner/inquiries?target=${t.id}`,
          });
      }
      notifications.push({
        eventKey: `handover:${handoverId}:${r.id}`,
        kind: "RESERVATION_UPDATED",
        eventId: r.eventId,
        requestId: r.id,
        revision: r.version,
        accounts,
        messages: [],
      });
    }
    await this.notices.recordBatch(m, notifications);
    return rows.map((r) => r.id);
  }
  async dispatch(requests: string[]) {
    for (const id of requests) await this.sender.dispatchRequest(id);
  }
}
