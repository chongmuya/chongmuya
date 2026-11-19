import { Injectable } from "@nestjs/common";
import { In, type EntityManager } from "typeorm";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { SelectedReservation } from "./entities/selected-reservation.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import { NotificationsService } from "../notifications/notifications.service.js";
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
    return events.length
      ? m.countBy(SelectedReservation, {
          eventId: In(events),
          status: In(["PREPARING", "CONFIRMED"]),
        })
      : 0;
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
      await this.notices.record(m, {
        eventKey: `handover:${handoverId}:${r.id}`,
        kind: "RESERVATION_UPDATED",
        eventId: r.eventId,
        requestId: r.id,
        revision: r.version,
        accounts,
        messages: [],
      });
    }
    return rows.map((r) => r.id);
  }
  async dispatch(requests: string[]) {
    for (const id of requests) await this.sender.dispatchRequest(id);
  }
}
