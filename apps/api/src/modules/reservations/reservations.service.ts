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
    return db.transaction(async (manager) => {
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
      await manager.getRepository(RequestTarget).insert(
        targets.map((target) => ({
          ...target,
          id: randomUUID(),
          requestId: row.id,
          deliveryStatus: "PENDING" as const,
        })),
      );
      return this.dto(row, manager);
    });
  }
  private async dto(
    row: ReservationRequest,
    manager: EntityManager,
  ): Promise<ReservationRequestDto> {
    const targets = await manager
      .getRepository(RequestTarget)
      .find({ where: { requestId: row.id }, order: { restaurantId: "ASC" } });
    return {
      id: row.id,
      eventId: row.eventId,
      createdAt: row.createdAt.toISOString(),
      status: "RECEIVED",
      responseCount: 0,
      snapshot: row.snapshot,
      contact: {
        name: row.contactName,
        maskedPhone: `${row.contactPhone.slice(0, 3)}-****-${row.contactPhone.slice(-4)}`,
        phoneVerifiedAt: row.contactPhoneVerifiedAt?.toISOString() ?? null,
      },
      targets: targets.map((t) => ({
        id: t.id,
        restaurantId: t.restaurantId,
        restaurantName: t.restaurantName,
        address: t.address,
        isDemo: t.isDemo,
        deliveryStatus: t.deliveryStatus,
      })),
    };
  }
  // No public HTTP route: available only to an operator with server/DB access.
  async pendingForOperations() {
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (manager) => {
      const targets = await manager
        .getRepository(RequestTarget)
        .createQueryBuilder("target")
        .innerJoin(
          ReservationRequest,
          "request",
          "request.id = target.request_id",
        )
        .select([
          "request.id AS request_id",
          "request.event_id AS event_id",
          "request.created_at AS received_at",
          "request.snapshot AS conditions",
          "request.contact_name AS organizer_name",
          "request.contact_phone AS organizer_phone",
          "target.id AS target_id",
          "target.contact_id AS contact_id",
          "target.restaurant_id AS restaurant_id",
          "target.restaurant_name AS restaurant_name",
          "target.is_demo AS is_demo",
          "target.contact_name AS recipient_name",
          "target.contact_phone AS recipient_phone",
          "target.consent_at AS consent_at",
          "target.delivery_status AS delivery_status",
        ])
        .where("target.delivery_status = :status", { status: "PENDING" })
        .orderBy("request.created_at", "ASC")
        .addOrderBy("target.id", "ASC")
        .getRawMany<{
          request_id: string;
          contact_id: string;
          restaurant_id: string;
          recipient_phone: string;
          [key: string]: unknown;
        }>();
      const decisions = await this.restaurants.deliveryEligibility(
        targets.map((t) => ({
          contactId: t.contact_id,
          restaurantId: t.restaurant_id,
          contactPhone: t.recipient_phone,
        })),
        manager,
      );
      return {
        eligible: targets.filter((_t, i) => !decisions[i]!.length),
        held: targets.flatMap((t, i) =>
          decisions[i]!.length ? [{ ...t, holdReasons: decisions[i] }] : [],
        ),
      };
    });
  }
}
