import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import type { RestaurantDraft } from "../entities/restaurant-draft.entity.js";
import { Restaurant } from "../entities/restaurant.entity.js";
import { normalizeRestaurantText as norm } from "./restaurant-policy.js";
type IdentityInput = Pick<
  RestaurantDraft,
  "restaurantId" | "selectedAddress"
> & {
  data: Pick<RestaurantDraft["data"], "name" | "detailAddress">;
};
export function restaurantIdentityKey(d: IdentityInput) {
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
export async function findDuplicateRestaurant(
  d: IdentityInput,
  m: EntityManager,
) {
  if (!d.selectedAddress || !d.data.name.trim())
    throw new DomainHttpException("ADDRESS_SELECTION_REQUIRED");
  const key = restaurantIdentityKey(d);
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
