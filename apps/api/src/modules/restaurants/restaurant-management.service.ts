import {
  restaurantIdentityKey,
  findDuplicateRestaurant,
} from "./lib/restaurant-identity.js";
import { Injectable, NotFoundException } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import type { AuthUser } from "../auth/types/auth-user.js";
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
      const r = restaurantId
        ? await this.restaurants.assertOwned(user.id, restaurantId, m, true)
        : null;
      if (previous && !restaurantId) return this.view(previous);
      const { data, address, proof } = await this.contents(r, m);
      const currentRestaurant = r
        ? { version: r.version, published: r.published, data }
        : null;
      if (previous && !previous.submittedAt)
        return { ...this.view(previous), currentRestaurant };
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
      return { ...this.view(draft), currentRestaurant };
    });
  }
  private async contents(r: Restaurant | null, m: EntityManager) {
    const data = emptyRegistration();
    let address: RestaurantDraft["selectedAddress"] = null;
    let proof: RestaurantDraft["verifiedContact"] = null;
    if (r) {
      const contact = await m.findOne(RestaurantContact, {
        where: { restaurantId: r.id },
        order: { isPrimary: "DESC", active: "DESC", id: "ASC" },
      });
      const spaces = await m.findBy(RestaurantSpace, { restaurantId: r.id });
      Object.assign(data, {
        name: r.name,
        branchName: r.branchName ?? "",
        addressQuery: r.baseAddress ?? r.address,
        detailAddress: r.baseAddress ? (r.detailAddress ?? "") : "",
        category: r.category ?? "",
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
      if (contact?.active && contact.requestConsentAt)
        proof = {
          phone: contact.phone,
          verifiedAt: contact.requestConsentAt.toISOString(),
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
        input.advance && d.step === 0
          ? await findDuplicateRestaurant(d, m)
          : undefined;
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
  async checkDuplicate(user: AuthUser, id: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `owner-duplicate:${user.id}`, 30);
    return db.transaction(async (m) => {
      const d = await this.draft(user, id, m);
      const duplicate = await findDuplicateRestaurant(d, m);
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
      if (
        !d.selectedAddress ||
        d.data.addressQuery !== d.selectedAddress.baseAddress
      )
        throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
      if (await findDuplicateRestaurant(d, m))
        throw new DomainHttpException("RESTAURANT_DUPLICATE");
      const data = d.data,
        address = d.selectedAddress;
      const previous = d.restaurantId
        ? await this.restaurants.assertOwned(user.id, d.restaurantId, m, true)
        : null;
      if (previous && previous.version !== d.restaurantVersion)
        throw new DomainHttpException("RESTAURANT_VERSION_CONFLICT");
      if (previous && !previous.isDemo && address.source === "fake")
        throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
      if (
        !["한식", "호프·주점", "기타 음식점"].includes(data.category) &&
        !(previous && (previous.category ?? "") === data.category)
      )
        throw new DomainHttpException("VALIDATION_FAILED");
      const restaurantId = previous?.id ?? randomUUID();
      const contacts = previous
        ? await m.find(RestaurantContact, {
            where: { restaurantId },
            order: { isPrimary: "DESC", active: "DESC", id: "ASC" },
          })
        : [];
      const original = contacts[0];
      const contactChanged =
        !previous ||
        (original?.phone ?? "") !== data.phone ||
        Boolean(original?.active && original.requestConsentAt) !==
          data.receiveConsent;
      if (!validRegistration(data, !!previous && !contactChanged))
        throw new DomainHttpException("VALIDATION_FAILED");
      const verified =
        (user.phone === data.phone && user.phoneVerifiedAt) ||
        (d.verifiedContact?.phone === data.phone &&
          d.verifiedContact.verifiedAt);
      if (contactChanged && !verified)
        throw new DomainHttpException("PHONE_VERIFICATION_REQUIRED");
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
        registrationKey: restaurantIdentityKey(d),
        category: data.category || null,
        region: address.region,
        latitude: address.latitude,
        longitude: address.longitude,
        maxCapacity: data.maxCapacity,
        minimumGuests: previous?.minimumGuests ?? null,
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
      if (contactChanged) {
        const matching =
          contacts.find((c) => c.phone === data.phone && c.active) ??
          contacts.find((c) => c.phone === data.phone);
        if (original?.isPrimary && original.id !== matching?.id) {
          await m.update(RestaurantContact, original.id, {
            isPrimary: false,
            active: false,
          });
        }
        await m.save(RestaurantContact, {
          id: matching?.id ?? randomUUID(),
          restaurantId,
          name: matching?.name ?? row.name.slice(0, 80),
          phone: data.phone,
          active: data.receiveConsent,
          isPrimary: data.receiveConsent,
          requestConsentAt: data.receiveConsent
            ? (matching?.requestConsentAt ?? new Date())
            : null,
          consentNote:
            data.receiveConsent && matching?.requestConsentAt
              ? matching.consentNote
              : `OWNER_ACCOUNT:${user.id}`,
        });
      }
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
      if (parsed.data.id) {
        const stored = await m.findOneBy(RestaurantMenu, {
          id: parsed.data.id,
          restaurantId,
        });
        if (!stored) throw new NotFoundException();
        const { name, kind, price, unit, position, available } = parsed.data;
        if (
          name === stored.name &&
          kind === stored.kind &&
          price === stored.price &&
          unit === stored.unit &&
          position === stored.position &&
          available === stored.available
        )
          return { version: r.version };
      }
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
}
