import type { AccountType } from "./signup.types";

export type Account = {
  accountType: AccountType | null;
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
};
export type Session = { authenticated: boolean; account: Account | null };
export type AuthState = {
  status:
    | "loading"
    | "anonymous"
    | "authenticated"
    | "unavailable"
    | "logging-out"
    | "logout-failed";
  account: Account | null;
};

export type SessionRequest = <T>(
  path: `/api/v1/${string}`,
  options?: RequestInit,
  timeoutMs?: number,
) => Promise<T>;
