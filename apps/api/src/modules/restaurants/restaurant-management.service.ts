import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { AuthService } from "../auth/auth.service.js";
import { PhoneVerificationService } from "../auth/phone-verification.service.js";
import { Restaurant } from "./entities/restaurant.entity.js";
import { RestaurantDraft } from "./entities/restaurant-draft.entity.js";
import { RestaurantSpace } from "./entities/restaurant-space.entity.js";
import { RestaurantContact } from "./entities/restaurant-contact.entity.js";
import { RestaurantMenu } from "./entities/restaurant-menu.entity.js";
import { RestaurantOperation } from "./entities/restaurant-operation.entity.js";
import { RestaurantsService } from "./restaurants.service.js";
import { Geocoder } from "./providers/geocoder.js";
import {
  normalizeRestaurantText as norm,
  policyValues,
  savePolicies,
} from "./lib/restaurant-policy.js";
import {
  emptyRegistration,
  registrationSchema,
  validRegistration,
  menuInputSchema,
} from "./types/registration.js";
import type { DraftSaveInput } from "./dto/request/owner-restaurant.request.dto.js";

@Injectable()
export class RestaurantManagementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly restaurants: RestaurantsService,
    private readonly geocoding: Geocoder,
    private readonly phones: PhoneVerificationService,
    private readonly auth: AuthService,
  ) {}
  private owner(user: AuthUser) {
    if (user.accountType !== "owner")
      throw new DomainHttpException("OWNER_REQUIRED");
  }
  private requester(user: AuthUser) {
    return createHmac("sha256", this.config.environment.authSecret)
      .update(`owner-contact:${user.id}`)
      .digest("base64url");
  }
  async context(user: AuthUser) {
    this.owner(user);
    const db = await this.database.connect();
    const restaurants = await db
      .getRepository(Restaurant)
      .find({ where: { ownerAccountId: user.id }, order: { name: "ASC" } });
    const drafts = await db
      .getRepository(RestaurantDraft)
      .findBy({ accountId: user.id });
    return {
      restaurants: restaurants.map((r) => ({
        id: r.id,
        name: r.name,
        branchName: r.branchName,
        published: r.published,
        version: r.version,
      })),
      drafts: drafts
        .filter((d) => !d.submittedAt)
        .map((d) => ({ id: d.id, restaurantId: d.restaurantId, step: d.step })),
      supportEmail: this.config.environment.ownerSupportEmail ?? null,
    };
  }
  async begin(user: AuthUser, restaurantId?: string) {
    this.owner(user);
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `owner-draft:${user.id}:${restaurantId ?? "new"}`,
      ]);
      const previous = await m.findOneBy(RestaurantDraft, {
        accountId: user.id,
        slot: restaurantId ?? "new",
      });
      if (previous && (!restaurantId || !previous.submittedAt))
        return this.view(previous);
      const r = restaurantId
        ? await this.restaurants.assertOwned(user.id, restaurantId, m, true)
        : null;
      const { data, address, proof } = await this.contents(r, m);
      const draft = await m.save(RestaurantDraft, {
        id: previous?.id ?? randomUUID(),
        accountId: user.id,
        slot: restaurantId ?? "new",
        restaurantId: r?.id ?? null,
        restaurantVersion: r?.version ?? null,
        version: (previous?.version ?? 0) + 1,
        step: 0,
        data,
        searchResults: [],
        selectedAddress: address,
        verifiedContact: proof,
        submittedAt: null,
      });
      return this.view(draft);
    });
  }
  private async contents(r: Restaurant | null, m: EntityManager) {
    const data = emptyRegistration();
    let address: RestaurantDraft["selectedAddress"] = null;
    let proof: RestaurantDraft["verifiedContact"] = null;
    if (r) {
      const contact = await m.findOne(RestaurantContact, {
        where: { restaurantId: r.id },
        order: { active: "DESC", id: "ASC" },
      });
      const spaces = await m.findBy(RestaurantSpace, { restaurantId: r.id });
      Object.assign(data, {
        name: r.name,
        branchName: r.branchName ?? "",
        addressQuery: r.baseAddress ?? r.address,
        detailAddress: r.baseAddress ? (r.detailAddress ?? "") : "",
        category: ["한식", "호프·주점", "기타 음식점"].includes(
          r.category ?? "",
        )
          ? r.category
          : "기타 음식점",
        phone: contact?.phone ?? "",
        receiveConsent: !!contact?.active && !!contact.requestConsentAt,
        maxCapacity: r.maxCapacity,
        minimumGuests: {
          kind:
            r.minimumGuests === null
              ? "UNKNOWN"
              : r.minimumGuests === 0
                ? "NONE"
                : "AT_LEAST",
          value: r.minimumGuests,
        },
        spaces: spaces.map(
          ({
            id,
            label,
            kind,
            availability,
            togetherSeating,
            capacity,
            minGuests,
            minSpend,
            separateFee,
            conditions,
          }) => ({
            id,
            label,
            kind,
            availability,
            togetherSeating,
            capacity,
            minGuests,
            minSpend,
            separateFee,
            conditions,
          }),
        ),
        policies: policyValues(r.policies),
      });
      address = {
        id: randomUUID(),
        query: data.addressQuery,
        baseAddress: data.addressQuery,
        roadAddress: r.baseAddress ?? "",
        jibunAddress: r.jibunAddress ?? "",
        latitude: r.latitude,
        longitude: r.longitude,
        region: r.region,
        source: "existing",
      };
      // Existing operational contacts retain their provenance; a changed number needs new proof.
      if (contact)
        proof = {
          phone: contact.phone,
          verifiedAt:
            contact.requestConsentAt?.toISOString() ?? new Date().toISOString(),
        };
    }
    return { data, address, proof };
  }
  private view(d: RestaurantDraft) {
    return {
      id: d.id,
      restaurantId: d.restaurantId,
      version: d.version,
      restaurantVersion: d.restaurantVersion,
      step: d.step,
      data: d.data,
      selectedAddress: d.selectedAddress,
      verifiedPhone: d.verifiedContact?.phone ?? null,
      submitted: !!d.submittedAt,
    };
  }
  private async draft(
    user: AuthUser,
    id: string,
    m: EntityManager,
    lock = false,
  ) {
    this.owner(user);
    const d = await m.findOne(RestaurantDraft, {
      where: { id, accountId: user.id },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!d) throw new NotFoundException();
    return d;
  }
  async getDraft(user: AuthUser, id: string) {
    const db = await this.database.connect();
    const d = await this.draft(user, id, db.manager);
    const r = d.restaurantId
      ? await this.restaurants.assertOwned(user.id, d.restaurantId, db.manager)
      : null;
    return {
      ...this.view(d),
      currentRestaurant: r
        ? {
            version: r.version,
            published: r.published,
            data: (await this.contents(r, db.manager)).data,
          }
        : null,
    };
  }
  async saveDraft(user: AuthUser, id: string, input: DraftSaveInput) {
    const parsed = registrationSchema.safeParse(input.data);
    if (!parsed.success) throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const d = await this.draft(user, id, m, true);
      if (d.version !== input.version || d.submittedAt)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      // Explicit confirmation of the latest restaurant; never silently rebase an edit.
      if (input.restaurantVersion !== undefined) {
        if (!d.restaurantId) throw new DomainHttpException("VALIDATION_FAILED");
        const r = await this.restaurants.assertOwned(
          user.id,
          d.restaurantId,
          m,
          true,
        );
        if (r.version !== input.restaurantVersion)
          throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
        d.restaurantVersion = r.version;
      }
      if (
        d.selectedAddress &&
        parsed.data.addressQuery !== d.selectedAddress.baseAddress
      )
        d.selectedAddress = null;
      if (input.addressId) {
        const address = d.searchResults.find(
          (a) =>
            a.id === input.addressId &&
            a.baseAddress === parsed.data.addressQuery,
        );
        if (!address)
          throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
        d.selectedAddress = address;
      }
      d.data = parsed.data;
      const duplicate =
        input.advance && d.step === 0 ? await this.duplicate(d, m) : undefined;
      if (!duplicate) d.step = input.step;
      d.version++;
      return {
        ...this.view(await m.save(d)),
        ...(duplicate
          ? {
              duplicate: {
                duplicate: true,
                ownRestaurantId:
                  duplicate.ownerAccountId === user.id ? duplicate.id : null,
                supportEmail: this.config.environment.ownerSupportEmail ?? null,
              },
            }
          : {}),
      };
    });
  }
  async search(user: AuthUser, id: string, query: string) {
    const db = await this.database.connect();
    await this.draft(user, id, db.manager);
    await consumeRequestLimit(db.manager, `owner-address:${user.id}`, 30);
    const results = await this.geocoding.search(query.trim());
    await db.transaction(async (m) => {
      const d = await this.draft(user, id, m, true);
      if (d.submittedAt)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      d.searchResults = results;
      await m.save(d);
    });
    return { results };
  }
  async verifyPhone(user: AuthUser, id: string, phone: string, ip: string) {
    const db = await this.database.connect();
    await this.draft(user, id, db.manager);
    return this.phones.create(phone, this.requester(user), ip);
  }
  async checkPhone(
    user: AuthUser,
    id: string,
    phone: string,
    verificationId: string,
  ) {
    const db = await this.database.connect();
    await this.draft(user, id, db.manager);
    const result = await this.phones.check(
      verificationId,
      phone,
      this.requester(user),
    );
    if (result.status === "verified")
      await db.transaction(async (m) => {
        const d = await this.draft(user, id, m, true);
        const verified = await this.phones.consume(
          m,
          this.requester(user),
          verificationId,
          phone,
        );
        d.verifiedContact = { phone, verifiedAt: verified.toISOString() };
        await m.save(d);
      });
    return result;
  }
  private key(d: RestaurantDraft) {
    return createHash("sha256")
      .update(
        JSON.stringify([
          norm(d.data.name),
          norm(d.selectedAddress!.baseAddress),
          norm(d.data.detailAddress),
        ]),
      )
      .digest("hex");
  }
  private async duplicate(d: RestaurantDraft, m: EntityManager) {
    if (!d.selectedAddress || !d.data.name.trim())
      throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
    const key = this.key(d);
    // A shared catalog lock also covers legacy rows without a structured key and ops normalization.
    await m.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-registration', 0))",
    );
    const bases = [
      d.selectedAddress.baseAddress,
      d.selectedAddress.roadAddress,
      d.selectedAddress.jibunAddress,
    ]
      .filter(Boolean)
      .map(norm);
    const detail = norm(d.data.detailAddress);
    return m
      .createQueryBuilder(Restaurant, "r")
      .where("r.id <> :id", {
        id: d.restaurantId ?? "00000000-0000-0000-0000-000000000000",
      })
      .andWhere("r.normalized_name = :name", { name: norm(d.data.name) })
      .andWhere(
        "(r.registration_key=:key OR r.normalized_address IN (:...addresses) OR (r.normalized_base_address IN (:...bases) AND r.normalized_detail_address=:detail))",
        {
          key,
          addresses: bases.map((base) => norm(`${base} ${detail}`)),
          bases,
          detail,
        },
      )
      .getOne();
  }
  async checkDuplicate(user: AuthUser, id: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `owner-duplicate:${user.id}`, 30);
    return db.transaction(async (m) => {
      const d = await this.draft(user, id, m);
      const duplicate = await this.duplicate(d, m);
      return {
        duplicate: !!duplicate,
        ownRestaurantId:
          duplicate?.ownerAccountId === user.id ? duplicate.id : null,
        supportEmail: this.config.environment.ownerSupportEmail ?? null,
      };
    });
  }
  async submit(user: AuthUser, id: string, version: number) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const d = await this.draft(user, id, m, true);
      if (d.submittedAt)
        return { restaurantId: d.restaurantId!, submitted: true };
      if (d.version !== version)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      if (!validRegistration(d.data))
        throw new DomainHttpException("VALIDATION_FAILED");
      if (
        !d.selectedAddress ||
        d.data.addressQuery !== d.selectedAddress.baseAddress
      )
        throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
      if (await this.duplicate(d, m))
        throw new DomainHttpException("RESTAURANT_DUPLICATE");
      const data = d.data,
        address = d.selectedAddress;
      const verified =
        (user.phone === data.phone && user.phoneVerifiedAt) ||
        (d.verifiedContact?.phone === data.phone &&
          d.verifiedContact.verifiedAt);
      if (!verified)
        throw new DomainHttpException("PHONE_VERIFICATION_REQUIRED");
      const previous = d.restaurantId
        ? await this.restaurants.assertOwned(user.id, d.restaurantId, m, true)
        : null;
      if (previous && previous.version !== d.restaurantVersion)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      if (previous && !previous.isDemo && address.source === "fake")
        throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
      const restaurantId = previous?.id ?? randomUUID();
      const oldSpaces = previous
        ? await m.findBy(RestaurantSpace, { restaurantId })
        : [];
      // Keep IDs and historical references; omitted spaces become unavailable.
      const seen = new Set<string>();
      for (const s of data.spaces) {
        if (s.id && (!oldSpaces.some((p) => p.id === s.id) || seen.has(s.id)))
          throw new DomainHttpException("VALIDATION_FAILED");
        if (s.id) seen.add(s.id);
      }
      const row = Object.assign(previous ?? new Restaurant(), {
        id: restaurantId,
        ownerAccountId: user.id,
        version: (previous?.version ?? 0) + 1,
        name: norm(data.name),
        branchName: norm(data.branchName) || null,
        address: `${address.baseAddress} ${data.detailAddress}`.trim(),
        baseAddress:
          address.source === "existing" && !previous?.baseAddress
            ? null
            : address.baseAddress,
        jibunAddress: address.jibunAddress || null,
        detailAddress: data.detailAddress || null,
        registrationKey: this.key(d),
        category: data.category,
        region: address.region,
        latitude: address.latitude,
        longitude: address.longitude,
        maxCapacity: data.maxCapacity,
        minimumGuests: data.minimumGuests.value,
        policies: savePolicies(
          data.policies,
          previous?.policies ?? null,
          !previous,
        ),
      });
      if (!previous)
        Object.assign(row, {
          published: false,
          isDemo: address.source === "fake",
          verifiedAt: null,
          photoPath: null,
          spacePhotos: [],
          facilities: null,
        });
      if (row.address.length > 240)
        throw new DomainHttpException("VALIDATION_FAILED");
      await m.save(row);
      for (const s of oldSpaces)
        if (!seen.has(s.id)) {
          s.availability = "UNAVAILABLE";
          await m.save(s);
        }
      for (const s of data.spaces)
        await m.save(RestaurantSpace, {
          ...s,
          id: s.id ?? randomUUID(),
          restaurantId,
        });
      const contacts = await m.findBy(RestaurantContact, { restaurantId });
      const matching =
        contacts.find((c) => c.phone === data.phone && c.active) ??
        contacts.find((c) => c.phone === data.phone);
      for (const c of contacts)
        if (c.id !== matching?.id && c.active) {
          c.active = false;
          await m.save(c);
        }
      await m.save(RestaurantContact, {
        id: matching?.id ?? randomUUID(),
        restaurantId,
        name: row.name.slice(0, 80),
        phone: data.phone,
        active: data.receiveConsent,
        requestConsentAt: data.receiveConsent
          ? (matching?.requestConsentAt ?? new Date())
          : null,
        consentNote: data.receiveConsent ? `OWNER_ACCOUNT:${user.id}` : null,
      });
      await m.save(RestaurantOperation, {
        id: randomUUID(),
        restaurantId,
        action: previous ? "OWNER_UPDATED" : "OWNER_REGISTERED",
        actor: user.id,
        reason: "사장님 직접 저장",
        details: {},
        createdAt: new Date(),
      });
      d.restaurantId = restaurantId;
      d.submittedAt = new Date();
      d.version++;
      await m.save(d);
      return { restaurantId, submitted: true, published: row.published };
    });
  }
  async menus(user: AuthUser, restaurantId: string) {
    this.owner(user);
    const db = await this.database.connect();
    const r = await this.restaurants.assertOwned(
      user.id,
      restaurantId,
      db.manager,
    );
    return {
      version: r.version,
      menus: (
        await db.getRepository(RestaurantMenu).find({
          where: { restaurantId },
          order: { position: "ASC", id: "ASC" },
        })
      ).map(({ id, name, kind, price, unit, available, position }) => ({
        id,
        name,
        kind,
        price,
        unit,
        available,
        position,
      })),
    };
  }
  async saveMenu(
    user: AuthUser,
    restaurantId: string,
    version: number,
    input: unknown,
  ) {
    this.owner(user);
    const parsed = menuInputSchema.safeParse(input);
    if (!parsed.success) throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const r = await this.restaurants.assertOwned(
        user.id,
        restaurantId,
        m,
        true,
      );
      if (r.version !== version)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      if (
        parsed.data.id &&
        !(await m.existsBy(RestaurantMenu, {
          id: parsed.data.id,
          restaurantId,
        }))
      )
        throw new NotFoundException();
      await m.save(RestaurantMenu, {
        ...parsed.data,
        id: parsed.data.id ?? randomUUID(),
        restaurantId,
      });
      r.version++;
      await m.save(r);
      return { version: r.version };
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
      const draft = Object.assign(new RestaurantDraft(), {
        restaurantId: r.id,
        selectedAddress: matches[0],
        data: {
          ...emptyRegistration(),
          name: r.name,
          detailAddress: input.detailAddress,
        },
      });
      if (await this.duplicate(draft, m))
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
          registrationKey: this.key(draft),
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
      // The supplied stable ID makes retries harmless; consent and phone history are never rewritten.
      if (existing)
        return { restaurantId, contactId: existing.id, existing: true, dryRun };
      if (!dryRun) {
        await m.save(RestaurantContact, {
          ...data,
          restaurantId,
          active: !!data.requestConsentAt,
          requestConsentAt: data.requestConsentAt
            ? new Date(data.requestConsentAt)
            : null,
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
