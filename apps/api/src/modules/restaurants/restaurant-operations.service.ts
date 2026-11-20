import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { AuthService } from "../auth/auth.service.js";
import { Restaurant } from "./entities/restaurant.entity.js";
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
