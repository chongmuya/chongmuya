import {
  parseRestaurantData,
  restaurantImportSchema,
} from "../../src/modules/restaurants/types/restaurant-data.js";
import fixture from "../../src/database/seeds/data/restaurants.local.json" with { type: "json" };

// All values originate from the committed fake fixture, never the private production input.
export function restaurantDataFixture(prefix: string) {
  return {
    restaurants: parseRestaurantData(
      restaurantImportSchema(true),
      fixture,
    ).restaurants.map((r, i) => ({
      ...r,
      key: `${prefix}-${i}`,
      name: `${prefix} 가상 매장 ${i}`,
      contact: {
        phone: `0100000900${i}`,
        requestConsentAt: "2026-01-01T00:00:00Z",
        consentNote: "test-only",
      },
    })),
  };
}
