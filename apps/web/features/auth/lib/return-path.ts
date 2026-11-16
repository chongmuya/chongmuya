// Only routes the app owns can be resumed. Rebuild their query rather than
// forwarding an arbitrary URL (including encoded hosts, backslashes or hashes).
export function safeReturnPath(value: string | null | undefined): string {
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
    !["/", "/events", "/mypage", "/onboarding", "/getting-started"].includes(
      url.pathname,
    )
  )
    return "/events";
  const params = new URLSearchParams();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const key of url.pathname === "/events"
    ? ["event", "group"]
    : url.pathname === "/mypage"
      ? ["group"]
      : []) {
    const item = url.searchParams.get(key);
    if (item && uuid.test(item)) params.set(key, item);
  }
  return `${url.pathname}${params.size ? `?${params}` : ""}`;
}
