import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { Restaurant } from "./entities/restaurant.entity.js";
import { RestaurantSpace } from "./entities/restaurant-space.entity.js";
import { RestaurantMenu } from "./entities/restaurant-menu.entity.js";
import { RestaurantOperation } from "./entities/restaurant-operation.entity.js";
import { RestaurantContact } from "./entities/restaurant-contact.entity.js";
import { restaurantSeedId } from "./lib/restaurant-data-id.js";
import { saveRestaurantContact } from "./lib/restaurant-contact.js";
import {
  catalogPolicies,
  policyDescriptions,
  policyValues,
  savePolicies,
} from "./lib/restaurant-policy.js";
import {
  validPolicies,
  type PolicyDescriptionKey,
} from "./types/registration.js";
import {
  parseRestaurantData,
  restaurantImportSchema,
  restaurantUpdateSchema,
  RestaurantDataError,
} from "./types/restaurant-data.js";

type Run = { actor: string; reason: string; execute?: boolean };
type RestaurantIdentity = Pick<Restaurant, "id" | "name" | "address">;
const descriptionKeys: PolicyDescriptionKey[] = [
  "operatingHours",
  "bookingPolicy",
  "depositPolicy",
  "menuPolicy",
  "cancellationPolicy",
];
const targetId = (v: { id?: string; key?: string }) =>
  v.id ?? restaurantSeedId("restaurant", v.key!);
function unique(values: string[], path: string) {
  if (new Set(values).size !== values.length)
    throw new RestaurantDataError("VALIDATION_FAILED", [path]);
}
function validSpaces(
  spaces: Pick<RestaurantSpace, "capacity" | "minGuests">[],
  max: number | null,
) {
  return spaces.every(
    (s) =>
      (s.capacity === null ||
        s.minGuests === null ||
        s.minGuests <= s.capacity) &&
      (max === null || s.capacity === null || s.capacity <= max),
  );
}
function childId(
  kind: "space" | "menu",
  value: { id?: string; key?: string },
  restaurantId: string,
  parentKey?: string,
) {
  if (value.id) return value.id;
  // Owner-created restaurants have UUIDs but no catalog key. Their operational
  // child keys are scoped to that immutable restaurant ID.
  if (!parentKey && !value.key!.includes("/"))
    return restaurantSeedId(kind, `${restaurantId}/${value.key}`);
  const qualified = value.key!.includes("/")
    ? value.key!
    : parentKey
      ? `${parentKey}/${value.key}`
      : null;
  if (
    !qualified ||
    restaurantSeedId("restaurant", qualified.split("/")[0]!) !== restaurantId
  )
    throw new RestaurantDataError("RESOURCE_TARGET_CONFLICT");
  return restaurantSeedId(kind, qualified);
}
function operator(options: Run) {
  if (
    !options.actor.trim() ||
    options.actor.length > 100 ||
    !options.reason.trim() ||
    options.reason.length > 500
  )
    throw new RestaurantDataError("INVALID_OPERATOR");
}

@Injectable()
export class RestaurantDataService {
  constructor(private readonly database: DatabaseService) {}

  async menus(restaurantId: string) {
    if (!z.uuid().safeParse(restaurantId).success)
      throw new RestaurantDataError("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction("REPEATABLE READ", async (m) => {
      const r = await m.findOneBy(Restaurant, { id: restaurantId });
      if (!r) throw new RestaurantDataError("RESTAURANT_NOT_FOUND");
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
      throw new RestaurantDataError("VALIDATION_FAILED");
    const input = parsed.data;
    if (new Set(input.items.map((i) => i.id)).size !== input.items.length)
      throw new RestaurantDataError("VALIDATION_FAILED");
    return this.transaction({ actor, reason, execute: !dryRun }, async (m) => {
      const r = await m.findOne(Restaurant, {
        where: { id: restaurantId },
        ...(!dryRun ? { lock: { mode: "pessimistic_write" as const } } : {}),
      });
      if (!r) throw new RestaurantDataError("RESTAURANT_NOT_FOUND");
      if (r.version !== input.expectedVersion)
        throw new RestaurantDataError("RESTAURANT_VERSION_CONFLICT");
      const menus = await m.findBy(RestaurantMenu, { restaurantId });
      const changes = input.items.map((item) => {
        const menu = menus.find((v) => v.id === item.id);
        if (!menu) throw new RestaurantDataError("RESTAURANT_NOT_FOUND");
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

  private async transaction<T>(
    options: Run,
    action: (m: EntityManager) => Promise<T>,
  ) {
    operator(options);
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      if (!options.execute) await m.query("SET TRANSACTION READ ONLY");
      // Same registration lock as owner registration and address normalization.
      await m.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-registration',0))",
      );
      return action(m);
    });
  }
  private async collision(
    m: EntityManager,
    row: RestaurantIdentity,
    planned: RestaurantIdentity[] = [],
  ) {
    const found = (await m.query(
      `WITH planned AS (
        SELECT id, restaurant_identity_text(name) AS normalized_name,
          restaurant_identity_text(address) AS normalized_address
        FROM jsonb_to_recordset($4::jsonb) AS p(id uuid, name text, address text)
      ), effective AS (
        SELECT id, normalized_name, normalized_address FROM restaurants
        WHERE id NOT IN (SELECT id FROM planned)
        UNION ALL
        SELECT id, normalized_name, normalized_address FROM planned
      )
      SELECT id FROM effective WHERE id<>$1
        AND normalized_name=restaurant_identity_text($2)
        AND normalized_address=restaurant_identity_text($3) LIMIT 1`,
      [row.id, row.name, row.address, JSON.stringify(planned)],
    )) as { id: string }[];
    if (found.length) throw new RestaurantDataError("RESTAURANT_DUPLICATE");
  }
  private async audit(
    m: EntityManager,
    restaurantId: string,
    action: string,
    options: Run,
    details: Record<string, unknown> = {},
  ) {
    await m.save(RestaurantOperation, {
      id: randomUUID(),
      restaurantId,
      action,
      actor: options.actor,
      reason: options.reason,
      details,
      createdAt: new Date(),
    });
  }

  async import(raw: unknown, options: Run) {
    const { restaurants } = parseRestaurantData(restaurantImportSchema(), raw);
    unique(
      restaurants.map((r) => r.key),
      "restaurants",
    );
    for (const [i, r] of restaurants.entries()) {
      unique(
        r.spaces.map((s) => s.key),
        `restaurants.${i}.spaces`,
      );
      unique(
        r.menus.map((s) => s.key),
        `restaurants.${i}.menus`,
      );
      if (
        (r.latitude === null) !== (r.longitude === null) ||
        !validSpaces(r.spaces, r.maxCapacity)
      )
        throw new RestaurantDataError("VALIDATION_FAILED", [
          `restaurants.${i}`,
        ]);
    }
    return this.transaction(options, async (m) => {
      const result = {
        mode: options.execute ? "EXECUTED" : "PREVIEW",
        created: 0,
        skipped: 0,
        updated: 0,
      };
      const plannedIdentities = new Set<string>();
      for (const [index, input] of restaurants.entries()) {
        const id = restaurantSeedId("restaurant", input.key);
        const existing = await m.findOneBy(Restaurant, { id });
        if (existing) {
          if (existing.isDemo)
            throw new RestaurantDataError("RESTAURANT_DUPLICATE", [
              `restaurants.${index}`,
            ]);
          result.skipped++;
          continue; // Do not restore deleted children or withdrawn contacts from an old file.
        }
        const [identity] = (await m.query(
          "SELECT restaurant_identity_text($1) AS name, restaurant_identity_text($2) AS address",
          [input.name, input.address],
        )) as { name: string; address: string }[];
        const identityKey = JSON.stringify(identity);
        if (plannedIdentities.has(identityKey))
          throw new RestaurantDataError("RESTAURANT_DUPLICATE", [
            `restaurants.${index}`,
          ]);
        plannedIdentities.add(identityKey);
        await this.collision(m, {
          id,
          name: input.name,
          address: input.address,
        });
        result.created++;
        if (!options.execute) continue;
        const {
          key,
          spaces,
          menus,
          contact,
          verifiedAt,
          operatingHours,
          bookingPolicy,
          depositPolicy,
          menuPolicy,
          cancellationPolicy,
          ...fields
        } = input;
        const restaurant = await m.save(Restaurant, {
          ...fields,
          id,
          isDemo: false,
          ownerAccountId: null,
          version: 1,
          policies: catalogPolicies({
            operatingHours,
            bookingPolicy,
            depositPolicy,
            menuPolicy,
            cancellationPolicy,
          }),
          verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
        });
        for (const { key: childKey, ...space } of spaces)
          await m.insert(RestaurantSpace, {
            ...space,
            id: restaurantSeedId("space", `${key}/${childKey}`),
            restaurantId: id,
          });
        for (const [position, { key: childKey, ...menu }] of menus.entries())
          await m.insert(RestaurantMenu, {
            ...menu,
            position,
            id: restaurantSeedId("menu", `${key}/${childKey}`),
            restaurantId: id,
          });
        const contactId = contact
          ? await saveRestaurantContact(
              m,
              restaurant,
              contact,
              "operator",
              false,
              restaurantSeedId("contact", key),
            )
          : null;
        await this.audit(m, id, "DATA_IMPORTED", options, { contactId });
      }
      return result;
    });
  }

  async update(raw: unknown, options: Run) {
    const { restaurants } = parseRestaurantData(restaurantUpdateSchema, raw);
    unique(restaurants.map(targetId), "restaurants");
    return this.transaction(options, async (m) => {
      const result = {
        mode: options.execute ? "EXECUTED" : "PREVIEW",
        created: 0,
        skipped: 0,
        updated: 0,
      };
      // Earlier rows replace their DB identities in both preview and execution.
      const planned: RestaurantIdentity[] = [];
      for (const input of [...restaurants].sort((a, b) =>
        targetId(a).localeCompare(targetId(b)),
      )) {
        const index = restaurants.indexOf(input),
          path = `restaurants.${index}.changes`;
        const r = await m.findOne(Restaurant, {
          where: { id: targetId(input) },
          ...(options.execute
            ? { lock: { mode: "pessimistic_write" as const } }
            : {}),
        });
        if (!r)
          throw new RestaurantDataError("RESTAURANT_NOT_FOUND", [
            `restaurants.${index}`,
          ]);
        if (r.version !== input.expectedVersion)
          throw new RestaurantDataError("RESTAURANT_VERSION_CONFLICT", [
            `restaurants.${index}.expectedVersion`,
          ]);
        const {
          spaces,
          menus,
          contact,
          policies,
          verifiedAt,
          operatingHours,
          bookingPolicy,
          depositPolicy,
          menuPolicy,
          cancellationPolicy,
          ...fields
        } = input.changes;
        const oldName = r.name,
          oldAddress = r.address;
        Object.assign(r, fields);
        if ((r.latitude === null) !== (r.longitude === null))
          throw new RestaurantDataError("VALIDATION_FAILED", [path]);
        if (r.name !== oldName || r.address !== oldAddress) {
          await this.collision(m, r, planned);
          // A changed free-form address must not keep unrelated structured coordinates/identity.
          if (r.address !== oldAddress) {
            if (!("latitude" in fields) || !("longitude" in fields))
              throw new RestaurantDataError("VALIDATION_FAILED", [
                `${path}.latitude`,
                `${path}.longitude`,
              ]);
            r.baseAddress = null;
            r.jibunAddress = null;
            r.detailAddress = null;
          }
          r.registrationKey = null;
        }
        if (verifiedAt !== undefined)
          r.verifiedAt = verifiedAt ? new Date(verifiedAt) : null;
        if (policies) {
          const { weeklyHours, ...typed } = policies;
          const next = { ...policyValues(r.policies), ...typed };
          if (!validPolicies(next))
            throw new RestaurantDataError("VALIDATION_FAILED", [
              `${path}.policies`,
            ]);
          r.policies = savePolicies(next, r.policies, false);
          if (weeklyHours === null) delete r.policies.weeklyHours;
          else if (weeklyHours !== undefined)
            r.policies.weeklyHours = weeklyHours;
        }
        const descriptions = {
          operatingHours,
          bookingPolicy,
          depositPolicy,
          menuPolicy,
          cancellationPolicy,
        };
        for (const key of descriptionKeys) {
          if (descriptions[key] === undefined) continue;
          if (
            r.policies.descriptionOverrides.includes(key) ||
            (key === "operatingHours" && r.policies.weeklyHours)
          )
            throw new RestaurantDataError("POLICY_DESCRIPTION_OVERRIDDEN", [
              `${path}.${key}`,
            ]);
          r.policies.sourceDescriptions[key] = descriptions[key]!;
        }
        const allSpaces = await m.findBy(RestaurantSpace, {
          restaurantId: r.id,
        });
        const touched = new Set<string>();
        for (const change of spaces ?? []) {
          const id = childId("space", change, r.id, input.key);
          if (touched.has(id))
            throw new RestaurantDataError("VALIDATION_FAILED", [
              `${path}.spaces`,
            ]);
          touched.add(id);
          const existing = allSpaces.find((s) => s.id === id);
          if (
            (change.action === "add") === !!existing ||
            (!existing && change.action === "update")
          )
            throw new RestaurantDataError("RESOURCE_TARGET_CONFLICT", [
              `${path}.spaces`,
            ]);
          const next =
            change.action === "add"
              ? { ...change.data, id, restaurantId: r.id }
              : Object.assign(existing!, change.changes);
          if (change.action === "add") allSpaces.push(next as RestaurantSpace);
          if (options.execute) await m.save(RestaurantSpace, next);
        }
        if (!validSpaces(allSpaces, r.maxCapacity))
          throw new RestaurantDataError("VALIDATION_FAILED", [
            `${path}.spaces`,
          ]);
        touched.clear();
        for (const change of menus ?? []) {
          const id = childId("menu", change, r.id, input.key);
          if (touched.has(id))
            throw new RestaurantDataError("VALIDATION_FAILED", [
              `${path}.menus`,
            ]);
          touched.add(id);
          const existing = await m.findOneBy(RestaurantMenu, {
            id,
            restaurantId: r.id,
          });
          if (
            (change.action === "add") === !!existing ||
            (!existing && change.action === "update")
          )
            throw new RestaurantDataError("RESOURCE_TARGET_CONFLICT", [
              `${path}.menus`,
            ]);
          if (options.execute)
            await m.save(
              RestaurantMenu,
              change.action === "add"
                ? { ...change.data, id, restaurantId: r.id }
                : Object.assign(existing!, change.changes),
            );
        }
        let contactId: string | null | undefined;
        if (contact !== undefined)
          contactId = await saveRestaurantContact(
            m,
            r,
            contact,
            "operator",
            !options.execute,
          );
        if (options.execute) {
          r.version++;
          await m.save(r);
          await this.audit(m, r.id, "DATA_UPDATED", options, {
            fields: Object.keys(input.changes),
            ...(contactId !== undefined ? { contactId } : {}),
          });
        }
        planned.push({ id: r.id, name: r.name, address: r.address });
        result.updated++;
      }
      return result;
    });
  }

  async show(target?: { id?: string; key?: string }) {
    const db = await this.database.connect();
    const rows = await db.manager.find(Restaurant, {
      ...(target ? { where: { id: targetId(target) } } : {}),
      order: { id: "ASC" },
      take: 100,
    });
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        version: r.version,
        published: r.published,
        ...(target
          ? {
              descriptions: policyDescriptions(r.policies),
              policies: {
                ...policyValues(r.policies),
                weeklyHours: r.policies.weeklyHours ?? null,
              },
              spaces: (
                await db.manager.findBy(RestaurantSpace, { restaurantId: r.id })
              ).map(({ id, label, availability }) => ({
                id,
                label,
                availability,
              })),
              menus: (
                await db.manager.find(RestaurantMenu, {
                  where: { restaurantId: r.id },
                  order: { position: "ASC", id: "ASC" },
                })
              ).map(({ id, name, available, position }) => ({
                id,
                name,
                available,
                position,
              })),
              contacts: (
                await db.manager.findBy(RestaurantContact, {
                  restaurantId: r.id,
                })
              ).map(({ id, active, isPrimary, requestConsentAt }) => ({
                id,
                active,
                isPrimary,
                consentRecorded: !!requestConsentAt,
              })),
            }
          : {}),
      })),
    );
  }
}
