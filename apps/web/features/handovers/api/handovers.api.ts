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
  invitations: (Receipt & { targetLabel: string; expiresAt: string })[];
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
export const invitationPath = (
  groupId: string,
  cancelId?: string,
): `/api/v1/${string}` =>
  `/api/v1/groups/${groupId}/invitations${cancelId ? `/${cancelId}/cancel` : ""}`;
export const handoverPath = (
  groupId: string,
  cancelId?: string,
): `/api/v1/${string}` =>
  `/api/v1/handovers/groups/${groupId}${cancelId ? `/${cancelId}/cancel` : ""}`;
export const accessPath = (
  kind: "handover" | "invitation",
  id: string,
): `/api/v1/${string}` =>
  kind === "handover"
    ? `/api/v1/handovers/${id}`
    : `/api/v1/groups/invitations/${id}`;
export const accessPreviewQuery = (
  request: SessionRequest,
  accountId: string,
  kind: "handover" | "invitation",
  id: string,
  token: string,
) => ({
  queryKey: ["user", accountId, "group-access", kind, id],
  queryFn: () =>
    command<Preview & { groupName?: string; status?: string }>(
      request,
      `${accessPath(kind, id)}/preview`,
      { token },
    ),
  retry: false as const,
  staleTime: 0,
});
