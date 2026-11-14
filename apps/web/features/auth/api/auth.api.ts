import type { Account, SessionRequest } from "../types/auth.types";

export const getProfile = (request: SessionRequest, signal?: AbortSignal) =>
  request<Account>("/api/v1/auth/me", { signal });
