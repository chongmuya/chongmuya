import { policyDescriptions } from "./lib/restaurant-policy.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { In, IsNull, Not, type EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { Restaurant } from "./entities/restaurant.entity.js";
import { RestaurantContact } from "./entities/restaurant-contact.entity.js";
import { RestaurantSpace } from "./entities/restaurant-space.entity.js";
import { RestaurantMenu } from "./entities/restaurant-menu.entity.js";
import type { RestaurantDto } from "./dto/response/restaurant.response.dto.js";
import type { RestaurantsQuery } from "./dto/request/restaurants-query.request.dto.js";

@Injectable()
export class RestaurantsService {
  constructor(private readonly database: DatabaseService) {}

  async assertOwned(
    ownerId: string,
    id: string,
    manager: EntityManager,
    lock = false,
  ) {
    const row = await manager.findOne(Restaurant, {
      where: { id, ownerAccountId: ownerId },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!row) throw new NotFoundException();
    return row;
  }
  async ownedIds(ownerId: string, manager: EntityManager) {
    return (
      await manager.find(Restaurant, {
        where: { ownerAccountId: ownerId },
        select: { id: true },
      })
    ).map((r) => r.id);
  }
  async replyDefaults(id: string, manager: EntityManager) {
    const r = await manager.findOneBy(Restaurant, { id });
    if (!r) throw new NotFoundException();
    return {
      policies: r.policies,
      depositPolicy: r.depositPolicy,
      menuPolicy: r.menuPolicy,
      bookingPolicy: r.bookingPolicy,
    };
  }
  async list(input: RestaurantsQuery) {
    const db = await this.database.connect();
    const query = db
      .getRepository(Restaurant)
      .createQueryBuilder("r")
      .where("r.published = true");
    // A displayed area such as '세종대 · 어린이대공원' means either area.
    // Preserve spaces within an area name and escape literal SQL wildcards.
    const regions = [
      ...new Set(
        (input.region ?? "")
          .split("·")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (regions.length)
      query.andWhere(
        `(${regions.map((_, index) => `(r.region ILIKE :region${index} OR r.address ILIKE :region${index})`).join(" OR ")})`,
        Object.fromEntries(
          regions.map((region, index) => [
            `region${index}`,
            `%${region.replace(/[\\%_]/g, "\\$&")}%`,
          ]),
        ),
      );
    const [rows, total] = await query
      .orderBy("r.name", "ASC")
      .addOrderBy("r.id", "ASC")
      .skip(((input.page ?? 1) - 1) * 24)
      .take(24)
      .getManyAndCount();
    return {
      items: await this.publicDetails(rows, db.manager),
      total,
      page: input.page ?? 1,
      pageSize: 24,
    };
  }
  async get(id: string): Promise<RestaurantDto> {
    const db = await this.database.connect();
    const row = await db
      .getRepository(Restaurant)
      .findOneBy({ id, published: true });
    if (!row) throw new NotFoundException();
    return (await this.publicDetails([row], db.manager))[0]!;
  }
  private async publicDetails(
    rows: Restaurant[],
    manager: EntityManager,
  ): Promise<RestaurantDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [spaces, menus, contacts] = await Promise.all([
      manager.getRepository(RestaurantSpace).find({
        where: { restaurantId: In(ids) },
        order: { label: "ASC", id: "ASC" },
      }),
      manager.getRepository(RestaurantMenu).find({
        where: { restaurantId: In(ids), available: true },
        order: { position: "ASC", name: "ASC", id: "ASC" },
      }),
      manager.getRepository(RestaurantContact).find({
        select: { restaurantId: true },
        where: {
          restaurantId: In(ids),
          active: true,
          requestConsentAt: Not(IsNull()),
        },
      }),
    ]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      region: r.region,
      category: r.category,
      latitude: r.latitude,
      longitude: r.longitude,
      maxCapacity: r.maxCapacity,
      minimumGuests: r.minimumGuests,
      minimumOrder: r.policies?.minimumOrder ?? null,
      photoPath: r.photoPath,
      spacePhotos: [...r.spacePhotos].sort((a, b) => a.position - b.position),
      operatingHours: r.operatingHours,
      facilities: r.facilities,
      bookingPolicy: r.bookingPolicy,
      depositPolicy: r.depositPolicy,
      menuPolicy: r.menuPolicy,
      ...(r.policies ? policyDescriptions(r.policies, r) : {}),
      cancellationPolicy: r.cancellationPolicy,
      isDemo: r.isDemo,
      inquiryAvailable: contacts.some((c) => c.restaurantId === r.id),
      spaces: spaces
        .filter((s) => s.restaurantId === r.id)
        .map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          availability: s.availability,
          togetherSeating: s.togetherSeating,
          capacity: s.capacity,
          minGuests: s.minGuests,
          minSpend: s.minSpend,
          separateFee: s.separateFee,
          conditions: s.conditions,
        })),
      menus: menus
        .filter((m) => m.restaurantId === r.id)
        .map((m) => ({
          id: m.id,
          name: m.name,
          kind: m.kind,
          price: m.price,
          unit: m.unit,
        })),
    }));
  }
  // Called inside the inquiry transaction: event -> restaurants (UUID order) -> contacts.
  async deliveryEligibility(
    targets: {
      contactId: string;
      restaurantId: string;
      contactPhone: string;
    }[],
    manager: EntityManager,
    liveDelivery = false,
  ) {
    const restaurants =
      liveDelivery && targets.length
        ? await manager.findBy(Restaurant, {
            id: In(targets.map((t) => t.restaurantId)),
          })
        : [];
    const contacts = targets.length
      ? await manager.findBy(RestaurantContact, {
          id: In(targets.map((t) => t.contactId)),
        })
      : [];
    return targets.map((target) => {
      const current = contacts.find(
        (c) =>
          c.id === target.contactId && c.restaurantId === target.restaurantId,
      );
      const reasons: string[] = [];
      if (liveDelivery) {
        const restaurant = restaurants.find(
          (r) => r.id === target.restaurantId,
        );
        if (!restaurant?.published) reasons.push("RESTAURANT_UNPUBLISHED");
        if (
          restaurant?.isDemo ||
          /^0+$/.test(target.contactPhone) ||
          !/^01[016789]\d{7,8}$/.test(target.contactPhone)
        )
          reasons.push("DEMO_RECIPIENT");
      }
      if (!current) reasons.push("CONTACT_DELETED");
      else {
        if (!current.active) reasons.push("CONTACT_INACTIVE");
        if (!current.requestConsentAt) reasons.push("CONSENT_WITHDRAWN");
        if (current.phone !== target.contactPhone)
          reasons.push("PHONE_CHANGED");
      }
      return reasons;
    });
  }

  async deliveryRecipient(
    restaurantId: string,
    contactId: string,
    manager: EntityManager,
  ) {
    const contact = await manager.findOneBy(RestaurantContact, {
      id: contactId,
      restaurantId,
    });
    if (!contact) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
    const recipient = { restaurantId, contactId, contactPhone: contact.phone };
    const [reasons] = await this.deliveryEligibility(
      [recipient],
      manager,
      true,
    );
    if (reasons.length) throw new DomainHttpException("DELIVERY_RETRY_BLOCKED");
    return recipient;
  }

  async inquiryTargets(ids: string[], manager: EntityManager) {
    const targets = [];
    for (const id of [...ids].sort()) {
      const restaurant = await manager.getRepository(Restaurant).findOne({
        where: { id, published: true },
        lock: { mode: "pessimistic_write" },
      });
      const contact = await manager.getRepository(RestaurantContact).findOne({
        where: {
          restaurantId: id,
          active: true,
          requestConsentAt: Not(IsNull()),
        },
        order: { id: "ASC" },
        lock: { mode: "pessimistic_write" },
      });
      if (!restaurant || !contact)
        throw new DomainHttpException("RESTAURANT_INQUIRY_UNAVAILABLE");
      targets.push({
        restaurantId: id,
        restaurantName: restaurant.name,
        address: restaurant.address,
        isDemo: restaurant.isDemo,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        consentAt: contact.requestConsentAt!,
      });
    }
    return targets;
  }
}
