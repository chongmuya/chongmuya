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
  constructor(private readonly events: EventsService) {}
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
