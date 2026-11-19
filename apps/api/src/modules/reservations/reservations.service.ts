import { MessageDeliveryService } from "./message-delivery.service.js";
import { MessageDelivery } from "./entities/message-delivery.entity.js";
import { MerchantReplyRevision } from "./entities/merchant-reply.entity.js";
import { replyView } from "./lib/reply-view.js";
import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
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
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
    private readonly restaurants: RestaurantsService,
    private readonly delivery: MessageDeliveryService,
  ) {}

  async get(
    ownerId: string,
    eventId: string,
  ): Promise<ReservationRequestDto | null> {
    const db = await this.database.connect();
    await this.events.assertOwned(ownerId, eventId, db.manager);
    const request = await db
      .getRepository(ReservationRequest)
      .findOneBy({ eventId });
    return request ? this.dto(request, db.manager) : null;
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
        .findOneBy({ eventId });
      if (existing) {
        if (existing.requestKey !== input.requestKey)
          throw new DomainHttpException("EVENT_REQUEST_EXISTS");
        if (existing.digest !== digest)
          throw new DomainHttpException("RESERVATION_RETRY_CONFLICT");
        return this.dto(existing, manager);
      }
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
      const group = event.groupId
        ? await this.groups.getLabel(user.id, event.groupId, manager)
        : null;
      const row = await manager.getRepository(ReservationRequest).save({
        id: randomUUID(),
        eventId,
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
      return this.dto(row, manager);
    });
    if (created) {
      await this.delivery.dispatchRequest(result.id);
      return (await this.get(user.id, eventId))!;
    }
    return result;
  }
  private async dto(
    row: ReservationRequest,
    manager: EntityManager,
  ): Promise<ReservationRequestDto> {
    const targets = await manager
      .getRepository(RequestTarget)
      .find({ where: { requestId: row.id }, order: { restaurantId: "ASC" } });
    const enriched = await Promise.all(
      targets.map(async (t) => {
        const response = replyView(
          await manager.findOneBy(MerchantReplyRevision, {
            targetId: t.id,
            revision: t.replyVersion,
          }),
        );
        const delivery = await manager.findOne(MessageDelivery, {
          where: { targetId: t.id },
          order: { createdAt: "DESC" },
        });
        return {
          id: t.id,
          restaurantId: t.restaurantId,
          restaurantName: t.restaurantName,
          address: t.address,
          isDemo: t.isDemo,
          deliveryStatus: t.deliveryStatus,
          delivery: delivery
            ? {
                provider: delivery.provider,
                failureStage: delivery.failureStage,
                errorCode: delivery.errorCode,
                updatedAt: delivery.updatedAt.toISOString(),
              }
            : null,
          response,
        };
      }),
    );
    return {
      id: row.id,
      eventId: row.eventId,
      createdAt: row.createdAt.toISOString(),
      status: "RECEIVED",
      responseCount: enriched.filter((t) => t.response).length,
      proposalCount: enriched.filter(
        (t) => t.response && t.response.kind !== "DECLINE",
      ).length,
      declineCount: enriched.filter((t) => t.response?.kind === "DECLINE")
        .length,
      snapshot: row.snapshot,
      contact: {
        name: row.contactName,
        maskedPhone: `${row.contactPhone.slice(0, 3)}-****-${row.contactPhone.slice(-4)}`,
        phoneVerifiedAt: row.contactPhoneVerifiedAt?.toISOString() ?? null,
      },
      targets: enriched,
    };
  }
}
