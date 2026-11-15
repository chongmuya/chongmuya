import { safeReturnPath } from "./return-path";

export function authEntryPath(
  path: "/auth" | "/start",
  next: string,
  mode?: "signup",
) {
  const params = new URLSearchParams();
  if (mode === "signup" && path === "/auth") params.set("mode", "signup");
  params.set("next", safeReturnPath(next));
  return `${path}?${params}`;
}
