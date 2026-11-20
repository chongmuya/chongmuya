import { createHash } from "node:crypto";

// Keep the existing UUID namespace and keys: persisted references depend on them.
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
