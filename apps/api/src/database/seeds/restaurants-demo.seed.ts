import type { DataSource, EntityManager } from "typeorm";
import fixture from "./data/restaurants.local.json" with { type: "json" };
import { catalogPolicies } from "../../modules/restaurants/lib/restaurant-policy.js";
import { restaurantSeedId } from "../../modules/restaurants/lib/restaurant-data-id.js";
import {
  parseRestaurantData,
  restaurantImportSchema,
} from "../../modules/restaurants/types/restaurant-data.js";
import { Restaurant } from "../../modules/restaurants/entities/restaurant.entity.js";
import { RestaurantSpace } from "../../modules/restaurants/entities/restaurant-space.entity.js";
import { RestaurantMenu } from "../../modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantContact } from "../../modules/restaurants/entities/restaurant-contact.entity.js";
import { claimSeedContact } from "./claim-contact.seed.js";

// Only identity mappings live in code. Names, policies, spaces and menus come from the local JSON.
const legacyKeys = [
  "demo-ongi-hall",
  "demo-hancheung-table",
  "demo-sodam",
  "demo-maru",
];
const legacyId = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const demoRestaurantIds = legacyKeys.map((_, i) =>
  legacyId("c0210000", i + 1),
);
export async function seedDemoRestaurants(db: DataSource) {
  await db.transaction((m) => seedDemoRestaurantRows(m));
}
export async function seedDemoRestaurantRows(
  m: EntityManager,
  ownerPhone?: string,
) {
  const { restaurants } = parseRestaurantData(
    restaurantImportSchema(true),
    fixture,
  );
  if (new Set(restaurants.map((r) => r.key)).size !== restaurants.length)
    throw new Error("DUPLICATE_DEMO_KEY");
  await m.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-registration',0))",
  );
  for (const input of restaurants) {
    const i = legacyKeys.indexOf(input.key);
    const id =
      i < 0
        ? restaurantSeedId("restaurant", `local/${input.key}`)
        : demoRestaurantIds[i]!;
    const existing = await m.findOneBy(Restaurant, { id });
    if (existing) {
      if (!existing.isDemo)
        throw new Error("DEMO_RESTAURANT_IDENTITY_CONFLICT");
      continue;
    }
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
    await m.insert(Restaurant, {
      ...fields,
      id,
      isDemo: true,
      policies: catalogPolicies({
        operatingHours,
        bookingPolicy,
        depositPolicy,
        menuPolicy,
        cancellationPolicy,
      }),
      verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
    });
    for (const { key: childKey, ...space } of spaces) {
      const j = ["hall", "floor", "whole"].indexOf(childKey);
      const childId =
        i >= 0 && j >= 0
          ? legacyId("c0220000", i * 3 + j + 1)
          : restaurantSeedId("space", `local/${key}/${childKey}`);
      await m.insert(RestaurantSpace, {
        ...space,
        id: childId,
        restaurantId: id,
      });
    }
    for (const [position, { key: childKey, ...menu }] of menus.entries()) {
      const childId =
        i >= 0 && childKey === "daily-meal"
          ? legacyId("c0230000", i + 1)
          : restaurantSeedId("menu", `local/${key}/${childKey}`);
      await m.insert(RestaurantMenu, {
        ...menu,
        position,
        id: childId,
        restaurantId: id,
      });
    }
    const contactId =
      i >= 0
        ? legacyId("c0240000", i + 1)
        : restaurantSeedId("contact", `local/${key}`);
    if (contact && (await claimSeedContact(m, contactId)))
      await m.insert(RestaurantContact, {
        ...contact,
        id: contactId,
        restaurantId: id,
        name: input.name.slice(0, 80),
        // The first demo owner's fake verified phone stays connected to the existing scenario.
        phone: i === 0 && ownerPhone ? ownerPhone : contact.phone,
        active: !!contact.requestConsentAt,
        isPrimary: !!contact.requestConsentAt,
        requestConsentAt: contact.requestConsentAt
          ? new Date(contact.requestConsentAt)
          : null,
      });
  }
}
