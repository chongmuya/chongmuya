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

  async list(input: RestaurantsQuery) {
    const db = await this.database.connect();
    const query = db
      .getRepository(Restaurant)
      .createQueryBuilder("r")
      .where("r.published = true");
    if (input.region?.trim())
      query.andWhere("(r.region ILIKE :region OR r.address ILIKE :region)", {
        region: `%${input.region.trim().replace(/[\\%_]/g, "\\$&")}%`,
      });
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
        order: { name: "ASC", id: "ASC" },
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
      photoPath: r.photoPath,
      operatingHours: r.operatingHours,
      facilities: r.facilities,
      bookingPolicy: r.bookingPolicy,
      depositPolicy: r.depositPolicy,
      menuPolicy: r.menuPolicy,
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
