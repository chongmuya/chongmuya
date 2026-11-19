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
    value.includes("\\") ||
    Array.from(value).some((c) => c.charCodeAt(0) <= 32)
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
      "/owner",
      "/owner/register",
      "/owner/menus",
      "/owner/inquiries",
    ].includes(url.pathname)
  )
    return "/events";
  if (url.pathname === "/onboarding") return "/getting-started";
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
    const view = url.searchParams.get("view");
    if (
      view &&
      ["list", "map", "detail", "conditions", "review"].includes(view)
    )
      params.set("view", view);
    const region = url.searchParams.get("region");
    if (region && region.length <= 80) params.set("region", region);
    const page = url.searchParams.get("page");
    if (page && /^[1-9][0-9]{0,3}$/.test(page)) params.set("page", page);
  }
  if (url.pathname.startsWith("/owner")) {
    for (const key of ["restaurant", "target"]) {
      const item = url.searchParams.get(key);
      if (item && uuid.test(item)) params.set(key, item);
    }
  }
  for (const key of url.pathname === "/events"
    ? ["event", "group", "round", "participant", "review"]
    : url.pathname === "/mypage" ||
        url.pathname === "/" ||
        url.pathname === "/groups/new"
      ? ["group"]
      : []) {
    const item = url.searchParams.get(key);
    if (item && uuid.test(item)) params.set(key, item);
  }
  if (url.pathname === "/events" && url.searchParams.get("action") === "add")
    params.set("action", "add");
  const view = url.searchParams.get("view");
  if (url.pathname === "/" && view === "personal" && !params.has("group"))
    params.set("view", view);
  if (
    url.pathname === "/mypage" &&
    view &&
    ["account", "groups"].includes(view)
  )
    params.set("view", view);
  if (
    url.pathname === "/events" &&
    view &&
    ["reservation", "attendance", "roster"].includes(view)
  )
    params.set("view", view);
  return `${url.pathname}${params.size ? `?${params}` : ""}`;
}
