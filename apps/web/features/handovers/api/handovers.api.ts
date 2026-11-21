import type { SessionRequest } from "@/features/auth/types";
export type Scope = {
  roster: number;
  events: number;
  settlements: number;
  files: number;
  favorites: number;
  ongoingReservations: number;
  ongoingInquiries: number;
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

export const groupPreviewQuery = (
  request: SessionRequest,
  accountId: string,
  groupId: string,
) =>
  query<Preview>(
    request,
    handoverKey(accountId, groupId),
    `/api/v1/handovers/groups/${groupId}`,
  );
export const groupAccountsQuery = (
  request: SessionRequest,
  accountId: string,
  groupId: string,
) =>
  query<Accounts>(
    request,
    ["user", accountId, "group-accounts", groupId],
    `/api/v1/groups/${groupId}/accounts`,
  );
export const handoverPath = (
  groupId: string,
  cancelId?: string,
): `/api/v1/${string}` =>
  `/api/v1/handovers/groups/${groupId}${cancelId ? `/${cancelId}/cancel` : ""}`;
export const handoverAccessPath = (id: string): `/api/v1/${string}` =>
  `/api/v1/handovers/${id}`;
export const handoverAccessPreviewQuery = (
  request: SessionRequest,
  accountId: string,
  id: string,
  token: string,
) => ({
  queryKey: ["user", accountId, "group-access", "handover", id],
  queryFn: () =>
    command<Pick<Preview, "group" | "scope">>(
      request,
      `${handoverAccessPath(id)}/preview`,
      { token },
    ),
  retry: false as const,
  staleTime: 0,
});
