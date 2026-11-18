import type {
  Restaurant,
  RestaurantConditions,
} from "../types/restaurant.types";

// Catalog compatibility is never a promise of availability on the requested date.
export function conditionsMatch(
  r: Restaurant,
  conditions?: RestaurantConditions,
): "조건 일치" | "조건 불일치" | "확인 필요" {
  if (!conditions) return "확인 필요";
  const { expectedGuests, seating, space } = conditions;
  if (r.maxCapacity !== null && r.maxCapacity < expectedGuests)
    return "조건 불일치";
  const spaces = r.spaces.filter((s) => space === "ANY" || s.kind === space);
  const matches = spaces.map((s) => {
    if (
      s.availability === "UNAVAILABLE" ||
      (s.capacity !== null && s.capacity < expectedGuests) ||
      (s.minGuests !== null && s.minGuests > expectedGuests) ||
      (seating === "CLOSE" && s.togetherSeating === "NO")
    )
      return "조건 불일치";
    if (
      s.availability === "UNKNOWN" ||
      s.capacity === null ||
      s.minGuests === null ||
      s.minSpend !== null ||
      s.separateFee === null ||
      (seating === "CLOSE" && s.togetherSeating === "UNKNOWN")
    )
      return "확인 필요";
    return "조건 일치";
  });
  if (matches.includes("조건 일치")) return "조건 일치";
  if (!matches.length || matches.includes("확인 필요")) return "확인 필요";
  return "조건 불일치";
}
