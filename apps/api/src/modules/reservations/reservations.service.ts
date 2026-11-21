import { AuthService } from "../auth/auth.service.js";
import { MessageDeliveryService } from "./message-delivery.service.js";

import { ReservationQueriesService } from "./reservation-queries.service.js";
import { ReservationSelectionService } from "./reservation-selection.service.js";
import { ReservationNotificationsService } from "./reservation-notifications.service.js";

import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";

import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { GroupsService } from "../groups/groups.service.js";
import { EventsService } from "../events/events.service.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { ReservationRequest } from "./entities/reservation-request.entity.js";
import { RequestTarget } from "./entities/request-target.entity.js";
import type { CreateReservationRequestInput } from "./dto/request/create-reservation-request.request.dto.js";
import type { ReservationRequestDto } from "./dto/response/reservation-request.response.dto.js";
import type { InquiryConditions } from "./types/inquiry.js";

@Injectable()
export class ReservationsService {
  constructor(
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
    private readonly restaurants: RestaurantsService,
    private readonly delivery: MessageDeliveryService,
    private readonly queries: ReservationQueriesService,
    private readonly selection: ReservationSelectionService,
    private readonly notifications: ReservationNotificationsService,
  ) {}

  async get(
    ownerId: string,
    eventId: string,
  ): Promise<ReservationRequestDto | null> {
    return this.queries.get(ownerId, eventId);
  }
  async create(
    user: AuthUser,
    eventId: string,
    input: CreateReservationRequestInput,
  ): Promise<ReservationRequestDto> {
    const c = input.conditions;
    const conditions: InquiryConditions = {
      startsAt: new Date(c.startsAt).toISOString(),
      expectedGuests: c.expectedGuests,
      region: c.region,
      seating: c.seating,
      space: c.space,
      seatingImportance:
        c.seating === "ANY" ? null : (c.seatingImportance ?? null),
      spaceImportance: c.space === "ANY" ? null : (c.spaceImportance ?? null),
      budgetBasis: c.budgetBasis ?? null,
      budgetAmount: c.budgetAmount ?? null,
      alcohol: c.budgetAmount ? (c.alcohol ?? "UNKNOWN") : null,
      additionalRequests: c.additionalRequests || null,
    };
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          conditions,
          contact: { name: input.contact.name, phone: input.contact.phone },
          restaurantIds: [...input.restaurantIds].sort(),
          expectedEventVersion: input.expectedEventVersion,
          ...(input.previousRequestId ||
          input.expectedRequestVersion !== undefined ||
          input.updateEventSchedule !== undefined
            ? {
                previousRequestId: input.previousRequestId ?? null,
                expectedRequestVersion: input.expectedRequestVersion ?? null,
                updateEventSchedule: input.updateEventSchedule ?? false,
              }
            : {}),
        }),
      )
      .digest("hex");
    const db = await this.database.connect();
    let created = false;
    const result = await db.transaction(async (manager) => {
      const event = await this.events.assertOwned(
        user.id,
        eventId,
        manager,
        true,
      );
      const existing = await manager
        .getRepository(ReservationRequest)
        .findOneBy({ eventId, requestKey: input.requestKey });
      if (existing) {
        if (existing.digest !== digest)
          throw new DomainHttpException("RESERVATION_RETRY_CONFLICT");
        return this.queries.dto(existing, manager);
      }
      const previous = await manager.findOne(ReservationRequest, {
        where: { eventId },
        order: { round: "DESC" },
      });
      if (previous)
        await this.selection.closeForReinquiry(
          user.id,
          previous,
          input,
          manager,
        );
      else if (input.previousRequestId)
        throw new DomainHttpException("RESERVATION_SELECTION_CONFLICT");
      if (event.version !== input.expectedEventVersion)
        throw new DomainHttpException("VERSION_CONFLICT");
      if (new Date(conditions.startsAt).getTime() <= Date.now())
        throw new DomainHttpException("RESERVATION_DATE_INVALID");
      if (
        (conditions.seating !== "ANY" && !conditions.seatingImportance) ||
        (conditions.space !== "ANY" && !conditions.spaceImportance) ||
        (conditions.budgetAmount !== null) !== (conditions.budgetBasis !== null)
      )
        throw new DomainHttpException("VALIDATION_FAILED");
      const targets = await this.restaurants.inquiryTargets(
        input.restaurantIds,
        conditions.expectedGuests,
        manager,
      );
      await this.auth.lockActiveAccount(user.id, manager);
      const group = event.groupId
        ? await this.groups.getLabel(user.id, event.groupId, manager)
        : null;
      const scheduleChanged = event.scheduledAt !== conditions.startsAt;
      if (scheduleChanged && !input.updateEventSchedule && previous)
        throw new DomainHttpException("EVENT_SCHEDULE_CONFIRMATION");
      await this.events.setReservationSchedule(
        eventId,
        conditions.startsAt,
        true,
        manager,
      );
      const row = await manager.getRepository(ReservationRequest).save({
        id: randomUUID(),
        eventId,
        round: (previous?.round ?? 0) + 1,
        version: 1,
        state: "ACTIVE" as const,
        createdById: user.id,
        currentContactAccountId: user.id,
        currentContactName: input.contact.name,
        currentContactPhone: input.contact.phone,
        requestKey: input.requestKey,
        digest,
        snapshot: {
          ...conditions,
          eventName: event.name,
          groupName: group?.name ?? null,
          groupType: group?.groupType ?? null,
        },
        contactName: input.contact.name,
        contactPhone: input.contact.phone,
        contactPhoneVerifiedAt:
          input.contact.phone === user.phone && user.phoneVerifiedAt
            ? new Date(user.phoneVerifiedAt)
            : null,
        createdAt: new Date(),
      });
      const savedTargets = await manager.getRepository(RequestTarget).save(
        targets.map((target) => ({
          ...target,
          id: randomUUID(),
          requestId: row.id,
          deliveryStatus: "PENDING" as const,
        })),
      );
      await this.delivery.prepare(row, savedTargets, manager);
      created = true;
      return this.queries.dto(row, manager);
    });
    if (created) {
      await this.delivery.dispatchRequest(result.id);
      if (input.previousRequestId)
        await this.notifications.dispatchRequest(input.previousRequestId);
      return (await this.get(user.id, eventId))!;
    }
    return result;
  }
}
