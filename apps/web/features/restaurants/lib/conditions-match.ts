import type {
  RestaurantSummary,
  RestaurantConditions,
} from "../types/restaurant.types";

// Catalog compatibility is never a promise of availability on the requested date.
export function conditionsMatch(
  r: RestaurantSummary,
  conditions?: RestaurantConditions,
): "인원·공간 일치" | "인원·공간 조건 불일치" | "인원·공간 확인 필요" {
  if (!conditions || !r.spaces.length) return "인원·공간 확인 필요";
  const { expectedGuests, seating, space } = conditions;
  const spaces = r.spaces.filter((s) => space === "ANY" || s.kind === space);
  const matches = spaces.map((s) => {
    if (
      s.availability === "UNAVAILABLE" ||
      (r.maxCapacity !== null && r.maxCapacity < expectedGuests) ||
      (r.minimumGuests != null && r.minimumGuests > expectedGuests) ||
      (s.capacity !== null && s.capacity < expectedGuests) ||
      (s.minGuests !== null && s.minGuests > expectedGuests) ||
      (seating === "CLOSE" && s.togetherSeating === "NO")
    )
      return "인원·공간 조건 불일치";
    if (
      s.availability === "UNKNOWN" ||
      r.minimumGuests === null ||
      s.capacity === null ||
      s.minGuests === null ||
      (seating === "CLOSE" && s.togetherSeating === "UNKNOWN")
    )
      return "인원·공간 확인 필요";
    return "인원·공간 일치";
  });
  if (matches.includes("인원·공간 일치")) return "인원·공간 일치";
  if (matches.includes("인원·공간 확인 필요")) return "인원·공간 확인 필요";
  return "인원·공간 조건 불일치";
}
