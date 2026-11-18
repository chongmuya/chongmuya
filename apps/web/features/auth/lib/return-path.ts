// Only routes the app owns can be resumed. Rebuild their query rather than
// forwarding an arbitrary URL (including encoded hosts, backslashes or hashes).
export function safeReturnPath(
  value: string | null | undefined,
  allowSetup = true,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/events";
  const url = new URL(value, "https://internal.invalid");
  if (
    url.origin !== "https://internal.invalid" ||
    ![
      "/",
      "/events",
      "/mypage",
      "/onboarding",
      "/getting-started",
      "/groups/new",
      "/restaurants",
    ].includes(url.pathname)
  )
    return "/events";
  const params = new URLSearchParams();
  if (url.pathname === "/getting-started") {
    if (!allowSetup) return "/events";
    if (url.searchParams.has("next"))
      params.set("next", safeReturnPath(url.searchParams.get("next"), false));
    if (url.searchParams.get("guide") === "1") params.set("guide", "1");
  }
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (url.pathname === "/restaurants") {
    for (const key of ["event", "restaurant"]) {
      const item = url.searchParams.get(key);
      if (item && uuid.test(item)) params.set(key, item);
    }
    const selected = [
      ...new Set(
        (url.searchParams.get("selected") ?? "")
          .split(",")
          .filter((id) => uuid.test(id)),
      ),
    ].slice(0, 3);
    if (selected.length) params.set("selected", selected.join(","));
    if (url.searchParams.get("inquiry") === "1") params.set("inquiry", "1");
  }
  for (const key of url.pathname === "/events"
    ? ["event", "group"]
    : url.pathname === "/mypage" ||
        url.pathname === "/" ||
        url.pathname === "/groups/new"
      ? ["group"]
      : []) {
    const item = url.searchParams.get(key);
    if (item && uuid.test(item)) params.set(key, item);
  }
  return `${url.pathname}${params.size ? `?${params}` : ""}`;
}
