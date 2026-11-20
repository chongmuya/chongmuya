import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { IsNull, Not } from "typeorm";
import { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { AuthService } from "../auth/auth.service.js";
import { Restaurant } from "./entities/restaurant.entity.js";
import { RestaurantMenu } from "./entities/restaurant-menu.entity.js";
import { RestaurantContact } from "./entities/restaurant-contact.entity.js";
import { RestaurantOperation } from "./entities/restaurant-operation.entity.js";
import { Geocoder } from "./providers/geocoder.js";
import {
  restaurantIdentityKey,
  findDuplicateRestaurant,
} from "./lib/restaurant-identity.js";

@Injectable()
export class RestaurantOperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly geocoding: Geocoder,
    private readonly auth: AuthService,
  ) {}
  async menus(restaurantId: string) {
    if (!z.uuid().safeParse(restaurantId).success)
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const r = await m.findOneBy(Restaurant, { id: restaurantId });
      if (!r) throw new NotFoundException();
      const menus = await m.find(RestaurantMenu, {
        where: { restaurantId },
        order: { position: "ASC", id: "ASC" },
      });
      return { restaurantId, version: r.version, menus };
    });
  }
  async patchMenuPrices(
    restaurantId: string,
    raw: unknown,
    actor: string,
    reason: string,
    dryRun = true,
  ) {
    const parsed = z
      .object({
        expectedVersion: z.number().int().positive(),
        evidence: z.string().trim().min(1).max(500),
        items: z
          .array(
            z
              .object({
                id: z.uuid(),
                price: z.number().int().min(0).max(2_000_000_000),
              })
              .strict(),
          )
          .min(1)
          .max(500),
      })
      .strict()
      .safeParse(raw);
    if (
      !parsed.success ||
      !z.uuid().safeParse(restaurantId).success ||
      !actor?.trim() ||
      actor.length > 100 ||
      !reason?.trim() ||
      reason.length > 500
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    const input = parsed.data;
    if (new Set(input.items.map((i) => i.id)).size !== input.items.length)
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const r = await m.findOne(Restaurant, {
        where: { id: restaurantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!r) throw new NotFoundException();
      if (r.version !== input.expectedVersion)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      const menus = await m.findBy(RestaurantMenu, { restaurantId });
      const changes = input.items.map((item) => {
        const menu = menus.find((v) => v.id === item.id);
        if (!menu) throw new NotFoundException();
        return { id: menu.id, previousPrice: menu.price, price: item.price };
      });
      const changed = changes.filter((v) => v.previousPrice !== v.price);
      if (!dryRun && changed.length) {
        for (const item of changed)
          await m.update(
            RestaurantMenu,
            { id: item.id, restaurantId },
            { price: item.price },
          );
        r.version++;
        await m.save(r);
        await m.save(RestaurantOperation, {
          id: randomUUID(),
          restaurantId,
          actor,
          reason,
          action: "MENU_PRICES_PATCHED",
          details: { evidence: input.evidence, prices: changed },
          createdAt: new Date(),
        });
      }
      return {
        restaurantId,
        version: r.version,
        dryRun,
        changed: changed.length,
        prices: changes,
      };
    });
  }
  async addressReview() {
    const db = await this.database.connect();
    return db.query(
      "SELECT id,name,address,identity_review AS reason FROM restaurants WHERE identity_review IS NOT NULL ORDER BY name,id",
    ) as Promise<
      { id: string; name: string; address: string; reason: string }[]
    >;
  }
  async normalizeAddress(input: {
    restaurantId: string;
    actor: string;
    reason: string;
    query: string;
    baseAddress: string;
    detailAddress: string;
    version: number;
    dryRun: boolean;
  }) {
    if (
      !input.actor?.trim() ||
      !input.reason?.trim() ||
      !input.query?.trim() ||
      !input.baseAddress?.trim() ||
      !Number.isInteger(input.version)
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    const results = await this.geocoding.search(input.query);
    const matches = results.filter((a) => a.baseAddress === input.baseAddress);
    if (matches.length !== 1)
      throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await m.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-registration', 0))",
      );
      const r = await m.findOne(Restaurant, {
        where: { id: input.restaurantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!r) throw new NotFoundException();
      if (r.version !== input.version)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      if (!r.isDemo && matches[0].source === "fake")
        throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
      const identity = {
        restaurantId: r.id,
        selectedAddress: matches[0],
        data: {
          name: r.name,
          detailAddress: input.detailAddress,
        },
      };
      if (await findDuplicateRestaurant(identity, m))
        throw new DomainHttpException("RESTAURANT_DUPLICATE");
      const oldAddress = r.address;
      if (!input.dryRun) {
        const a = matches[0];
        Object.assign(r, {
          baseAddress: a.baseAddress,
          jibunAddress: a.jibunAddress || null,
          detailAddress: input.detailAddress || null,
          address: `${a.baseAddress} ${input.detailAddress}`.trim(),
          latitude: a.latitude,
          longitude: a.longitude,
          registrationKey: restaurantIdentityKey(identity),
          version: r.version + 1,
        });
        if (r.address.length > 240)
          throw new DomainHttpException("VALIDATION_FAILED");
        await m.save(r);
        await m.save(RestaurantOperation, {
          id: randomUUID(),
          restaurantId: r.id,
          action: "ADDRESS_NORMALIZED",
          actor: input.actor,
          reason: input.reason,
          details: {},
          createdAt: new Date(),
        });
      }
      return {
        restaurantId: r.id,
        dryRun: input.dryRun,
        oldAddress,
        selectedAddress: matches[0].baseAddress,
        detailAddress: input.detailAddress,
      };
    });
  }
  async recordContact(
    restaurantId: string,
    input: unknown,
    actor: string,
    reason: string,
    dryRun: boolean,
  ) {
    const parsed = z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(80),
        phone: z.string().regex(/^01[016789]\d{7,8}$/),
        requestConsentAt: z.iso.datetime({ offset: true }).nullable(),
        consentNote: z.string().trim().min(1).max(500),
        primary: z.boolean().optional(),
      })
      .strict()
      .safeParse(input);
    if (
      !parsed.success ||
      !actor.trim() ||
      !reason.trim() ||
      (parsed.data.requestConsentAt &&
        Date.parse(parsed.data.requestConsentAt) > Date.now())
    )
      throw new DomainHttpException("VALIDATION_FAILED");
    const data = parsed.data;
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const restaurant = await m.findOne(Restaurant, {
        where: { id: restaurantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!restaurant) throw new NotFoundException();
      const existing = await m.findOneBy(RestaurantContact, { id: data.id });
      if (
        existing &&
        (existing.restaurantId !== restaurantId ||
          existing.phone !== data.phone)
      )
        throw new DomainHttpException("VALIDATION_FAILED");
      const consentAt = data.requestConsentAt
        ? new Date(data.requestConsentAt)
        : null;
      if (data.primary && !consentAt)
        throw new DomainHttpException("VALIDATION_FAILED");
      const primary =
        !!consentAt &&
        (data.primary ??
          (existing?.isPrimary ||
            !(await m.existsBy(RestaurantContact, {
              restaurantId,
              id: Not(data.id),
              active: true,
              requestConsentAt: Not(IsNull()),
            }))));
      if (
        existing &&
        existing.isPrimary === primary &&
        existing.active === !!consentAt &&
        existing.requestConsentAt?.getTime() === consentAt?.getTime() &&
        existing.consentNote === data.consentNote &&
        existing.name === data.name
      ) {
        return { restaurantId, contactId: existing.id, existing: true, dryRun };
      }
      if (!dryRun) {
        if (primary)
          await m.update(
            RestaurantContact,
            { restaurantId, isPrimary: true },
            { isPrimary: false },
          );
        await m.save(RestaurantContact, {
          id: data.id,
          restaurantId,
          name: data.name,
          phone: data.phone,
          active: !!consentAt,
          requestConsentAt: consentAt,
          consentNote: data.consentNote,
          isPrimary: primary,
        });
        restaurant.version++;
        await m.save(restaurant);
        await m.save(RestaurantOperation, {
          id: randomUUID(),
          restaurantId,
          actor,
          reason,
          action: "CONTACT_RECORDED",
          details: { contactId: data.id },
          createdAt: new Date(),
        });
      }
      return { restaurantId, contactId: data.id, dryRun };
    });
  }
  // Only the explicit server-side CLI invokes these operations; never exposed as owner HTTP routes.
  async operate(input: {
    restaurantId: string;
    actor: string;
    reason: string;
    accountId?: string;
    published?: boolean;
    dryRun: boolean;
  }) {
    if (!input.actor.trim() || !input.reason.trim())
      throw new ForbiddenException();
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await m.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-registration', 0))",
      );
      const r = await m.findOne(Restaurant, {
        where: { id: input.restaurantId },
        lock: { mode: "pessimistic_write" },
      });
      if (!r) throw new NotFoundException();
      if (input.accountId) {
        await this.auth.assertOwnerAccount(input.accountId, m);
        if (r.ownerAccountId && r.ownerAccountId !== input.accountId)
          throw new ForbiddenException();
      }
      if (!input.dryRun) {
        if (input.accountId) r.ownerAccountId = input.accountId;
        if (input.published !== undefined) r.published = input.published;
        r.version++;
        await m.save(r);
        await m.save(RestaurantOperation, {
          id: randomUUID(),
          restaurantId: r.id,
          actor: input.actor,
          reason: input.reason,
          action: input.accountId ? "OWNER_LINKED" : "PUBLICATION_CHANGED",
          details: { accountId: input.accountId, published: input.published },
          createdAt: new Date(),
        });
      }
      return {
        restaurantId: r.id,
        dryRun: input.dryRun,
        structuredAddress: !!r.baseAddress,
      };
    });
  }
}
