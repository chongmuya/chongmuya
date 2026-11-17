// NEXT_PUBLIC is statically embedded by Next; keep this direct property access.
export function apiOrigin(
  value = process.env.NEXT_PUBLIC_API_ORIGIN,
  production = process.env.NODE_ENV === "production",
): string {
  const configured =
    value ?? (production ? undefined : "http://localhost:3001");
  try {
    if (!configured) throw new Error();
    const url = new URL(configured);
    if (
      url.origin !== configured ||
      !["http:", "https:"].includes(url.protocol) ||
      (production && url.protocol !== "https:" && url.hostname !== "localhost")
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error("Invalid environment variable: NEXT_PUBLIC_API_ORIGIN");
  }
}
