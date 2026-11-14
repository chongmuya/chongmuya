export type Account = { id: string; email: string };
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
) => Promise<T>;
