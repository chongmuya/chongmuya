import type { SessionRequest } from "@/features/auth/types";
export type Scope = {
  roster: number;
  events: number;
  settlements: number;
  files: number;
  favorites: number;
  ongoingReservations: number;
  incompleteSettlements: number;
};
export type Receipt = {
  id: string;
  status: string;
  completedAt: string | null;
  expiresAt?: string;
};
export type Preview = {
  group: { id: string; name: string; version: number };
  scope: Scope;
  requests: (Receipt & { targetId: string; expiresAt: string })[];
};
export type Accounts = {
  version: number;
  ownerId: string;
  accounts: { id: string; name: string; email: string; role: string }[];
  invitations: (Receipt & { targetId: string; expiresAt: string })[];
};
export const handoverKey = (account: string, group: string) =>
  ["user", account, "handover", group] as const;
export const query = <T>(
  request: SessionRequest,
  key: readonly unknown[],
  path: `/api/v1/${string}`,
) => ({
  queryKey: key,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    request<T>(path, { signal }),
  retry: false as const,
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: "always" as const,
  refetchOnReconnect: "always" as const,
});
export const command = <T>(
  request: SessionRequest,
  path: `/api/v1/${string}`,
  body: object,
) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
