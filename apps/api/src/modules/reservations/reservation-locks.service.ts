import { Injectable, NotFoundException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { EventsService } from "../events/events.service.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
@Injectable()
export class ReservationLocksService {
  constructor(private readonly events: EventsService) {}
  async request(id: string, m: EntityManager) {
    const seed = await m.findOneBy(ReservationRequest, { id });
    if (!seed) throw new NotFoundException();
    const event = await this.events.lockReservationEvent(seed.eventId, m);
    const request = await m.findOneOrFail(ReservationRequest, {
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    const targets = await m.find(RequestTarget, {
      where: { requestId: id },
      order: { id: "ASC" },
      lock: { mode: "pessimistic_write" },
    });
    return { event, request, targets };
  }
  async target(id: string, m: EntityManager) {
    const seed = await m.findOneBy(RequestTarget, { id });
    if (!seed) throw new NotFoundException();
    const context = await this.request(seed.requestId, m);
    return { ...context, target: context.targets.find((t) => t.id === id)! };
  }
}
