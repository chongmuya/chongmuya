import type { Account } from "../types/auth.types";
import { safeReturnPath } from "./return-path";
export function isFirstSetupComplete(account: Account) {
  return (
    account.accountType === "owner" ||
    (account.accountType === "organizer" && !!account.nickname?.trim())
  );
}
export function firstSetupPath(returnTo: string) {
  const next = safeReturnPath(returnTo);
  return next.startsWith("/getting-started")
    ? next
    : `/getting-started?next=${encodeURIComponent(next)}`;
}
export function postLoginPath(account: Account, returnTo: string) {
  const next = safeReturnPath(returnTo);
  if (next === "/mypage/withdrawal") return next;
  return isFirstSetupComplete(account)
    ? account.accountType === "owner" && ["/", "/events"].includes(next)
      ? "/owner"
      : next
    : firstSetupPath(next);
}
