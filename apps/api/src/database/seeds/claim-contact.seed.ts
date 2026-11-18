import type { EntityManager } from "typeorm";
import { RestaurantContactSeedReceipt } from "../../modules/restaurants/entities/restaurant-contact-seed-receipt.entity.js";
import { RequestTarget } from "../../modules/reservations/entities/request-target.entity.js";

// Claim and contact insert share the caller's transaction. The unique receipt
// serializes concurrent seeds and survives contact deletion without storing PII.
export async function claimSeedContact(
  manager: EntityManager,
  contactId: string,
) {
  const inserted = await manager
    .createQueryBuilder()
    .insert()
    .into(RestaurantContactSeedReceipt)
    .values({ contactId })
    .orIgnore()
    .returning(["contactId"])
    .execute();
  return (
    (inserted.raw as unknown[]).length > 0 &&
    !(await manager.existsBy(RequestTarget, { contactId }))
  );
}
