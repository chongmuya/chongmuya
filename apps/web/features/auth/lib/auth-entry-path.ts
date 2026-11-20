import { safeReturnPath } from "./return-path";

export function authEntryPath(
  path:
    | "/auth"
    | "/start"
    | "/intro"
    | "/auth/signup"
    | "/auth/recovery"
    | "/auth/reset-password",
  next: string,
) {
  const params = new URLSearchParams();
  params.set("next", safeReturnPath(next));
  return `${path}?${params}`;
}
