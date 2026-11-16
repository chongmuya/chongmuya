import { safeReturnPath } from "./return-path";

export function authEntryPath(
  path: "/auth" | "/start" | "/auth/signup",
  next: string,
) {
  const params = new URLSearchParams();
  params.set("next", safeReturnPath(next));
  return `${path}?${params}`;
}
