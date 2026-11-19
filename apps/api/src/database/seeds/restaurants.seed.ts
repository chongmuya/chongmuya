import { catalogPolicies } from "../../modules/restaurants/lib/restaurant-policy.js";
import { createHash } from "node:crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";
import { Restaurant } from "../../modules/restaurants/entities/restaurant.entity.js";
import { RestaurantSpace } from "../../modules/restaurants/entities/restaurant-space.entity.js";
import { RestaurantMenu } from "../../modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantContact } from "../../modules/restaurants/entities/restaurant-contact.entity.js";
import { claimSeedContact } from "./claim-contact.seed.js";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);
const text = z.string().nullable().default(null);
const amount = z.number().int().nonnegative().nullable().default(null);
const capacity = z.number().int().positive().nullable().default(null);
const timestamp = z.iso.datetime({ offset: true }).nullable().default(null);
const spaceSchema = z.object({
  key,
  label: z.string().min(1).max(80),
  kind: z.enum(["HALL", "ROOM", "FLOOR", "WHOLE"]),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
  togetherSeating: z.enum(["YES", "NO", "UNKNOWN"]),
  capacity,
  minGuests: amount,
  minSpend: amount,
  separateFee: amount,
  conditions: text,
});
const menuSchema = z.object({
  key,
  name: z.string().min(1).max(100),
  kind: z.enum(["REGULAR", "SET"]),
  price: amount,
  unit: z.string().min(1).max(30),
  available: z.boolean(),
});
const fixtureSchema = z.object({
  restaurants: z.array(
    z.object({
      key,
      name: z.string().min(1).max(100),
      address: z.string().min(1).max(240),
      region: z.string().min(1).max(80),
      category: z.string().max(40).nullable().default(null),
      latitude: z.number().min(-90).max(90).nullable().default(null),
      longitude: z.number().min(-180).max(180).nullable().default(null),
      maxCapacity: capacity,
      photoPath: z.string().max(500).nullable().default(null),
      operatingHours: text,
      facilities: text,
      bookingPolicy: text,
      depositPolicy: text,
      menuPolicy: text,
      cancellationPolicy: text,
      published: z.boolean(),
      verifiedAt: timestamp,
      spaces: z.array(spaceSchema),
      menus: z.array(menuSchema),
    }),
  ),
});
const contactsSchema = z.object({
  contacts: z.array(
    z.object({
      restaurantKey: key,
      name: z.string().min(1).max(80),
      phone: z.string().regex(/^0\d{8,10}$/),
      active: z.boolean().default(true),
      requestConsentAt: timestamp,
      consentNote: text,
    }),
  ),
});

// UUIDv5 with the standard URL namespace. Keep fixture keys stable: renaming a
// display label must not replace rows already referenced by an inquiry.
export function restaurantSeedId(
  kind: "restaurant" | "space" | "menu" | "contact",
  fixtureKey: string,
): string {
  const bytes = createHash("sha1")
    .update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update(`https://chongmuya/seed/real-restaurants/v1/${kind}/${fixtureKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertUnique(keys: string[]) {
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate restaurant seed key");
}

// Explicit CLI/test entry point only. Insert missing fixture rows and preserve
// all existing operator edits, consent revocations and inquiry references.
// No implicit refresh/delete mode: corrections use the normal operations flow.
export async function seedRestaurants(
  db: DataSource,
  publicFixture: unknown,
  privateContacts: unknown = { contacts: [] },
): Promise<void> {
  const { restaurants } = fixtureSchema.parse(publicFixture);
  const { contacts } = contactsSchema.parse(privateContacts);
  assertUnique(restaurants.map((restaurant) => restaurant.key));
  assertUnique(contacts.map((contact) => contact.restaurantKey));
  const restaurantKeys = new Set(
    restaurants.map((restaurant) => restaurant.key),
  );
  if (contacts.some((contact) => !restaurantKeys.has(contact.restaurantKey)))
    throw new Error("Unknown restaurant contact key");
  for (const restaurant of restaurants) {
    if ((restaurant.latitude === null) !== (restaurant.longitude === null))
      throw new Error("Incomplete restaurant coordinates");
    assertUnique(restaurant.spaces.map((space) => space.key));
    assertUnique(restaurant.menus.map((menu) => menu.key));
  }

  await db.transaction(async (manager) => {
    for (const restaurant of restaurants) {
      const {
        key: restaurantKey,
        spaces,
        menus,
        verifiedAt,
        ...fields
      } = restaurant;
      const restaurantId = restaurantSeedId("restaurant", restaurantKey);
      await manager
        .createQueryBuilder()
        .insert()
        .into(Restaurant)
        .values({
          ...fields,
          policies: catalogPolicies(fields),
          id: restaurantId,
          isDemo: false,
          verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
        })
        .orIgnore()
        .execute();
      for (const { key: spaceKey, ...space } of spaces) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(RestaurantSpace)
          .values({
            ...space,
            id: restaurantSeedId("space", `${restaurantKey}/${spaceKey}`),
            restaurantId,
          })
          .orIgnore()
          .execute();
      }
      for (const { key: menuKey, ...menu } of menus) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(RestaurantMenu)
          .values({
            ...menu,
            id: restaurantSeedId("menu", `${restaurantKey}/${menuKey}`),
            restaurantId,
          })
          .orIgnore()
          .execute();
      }
    }
    for (const { restaurantKey, requestConsentAt, ...contact } of contacts) {
      const contactId = restaurantSeedId("contact", restaurantKey);
      if (!(await claimSeedContact(manager, contactId))) continue;
      const restaurantId = restaurantSeedId("restaurant", restaurantKey);
      const isPrimary =
        contact.active &&
        !!requestConsentAt &&
        !(await manager.existsBy(RestaurantContact, { restaurantId }));
      await manager
        .createQueryBuilder()
        .insert()
        .into(RestaurantContact)
        .values({
          ...contact,
          id: contactId,
          restaurantId,
          isPrimary,
          requestConsentAt: requestConsentAt
            ? new Date(requestConsentAt)
            : null,
        })
        .orIgnore()
        .execute();
    }
  });
}
