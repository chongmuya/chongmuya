import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import { RestaurantContact } from "../entities/restaurant-contact.entity.js";
import type { Restaurant } from "../entities/restaurant.entity.js";
import type { ContactData } from "../types/restaurant-data.js";

// Caller owns the restaurant row lock and authenticates its own source. This never sends messages or rewrites inquiry snapshots.
export async function saveRestaurantContact(
  m: EntityManager,
  restaurant: Pick<Restaurant, "id" | "name">,
  input: ContactData | null,
  source: "operator" | "verified-owner",
  dryRun = false,
  initialId?: string,
) {
  const contacts = await m.find(RestaurantContact, {
    where: { restaurantId: restaurant.id },
    order: { isPrimary: "DESC", active: "DESC", id: "ASC" },
  });
  const matching = input
    ? (contacts.find((c) => c.phone === input.phone && c.isPrimary) ??
      contacts.find((c) => c.phone === input.phone && c.active) ??
      contacts.find((c) => c.phone === input.phone))
    : undefined;
  const consentAt = input?.requestConsentAt
    ? new Date(input.requestConsentAt)
    : null;
  // An old agreement cannot revive a withdrawn contact. The owner path has fresh phone verification; operators must provide a newer consent fact.
  if (
    source === "operator" &&
    matching &&
    !matching.active &&
    consentAt &&
    matching.requestConsentAt &&
    consentAt <= matching.requestConsentAt
  )
    throw new DomainHttpException("VALIDATION_FAILED");
  const id = matching?.id ?? initialId ?? randomUUID();
  if (!dryRun) {
    for (const c of contacts)
      if (c.isPrimary && (c.id !== id || !consentAt))
        await m.update(RestaurantContact, c.id, {
          isPrimary: false,
          active: false,
        });
    if (input)
      await m.save(RestaurantContact, {
        id,
        restaurantId: restaurant.id,
        name: matching?.name ?? restaurant.name.slice(0, 80),
        phone: input.phone,
        active: !!consentAt,
        isPrimary: !!consentAt,
        // Retain withdrawn consent as historical evidence, but active/isPrimary prevent delivery.
        requestConsentAt: consentAt ?? matching?.requestConsentAt ?? null,
        consentNote: input.consentNote,
      });
  }
  return input ? id : null;
}
