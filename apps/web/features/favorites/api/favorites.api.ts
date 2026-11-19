import type { SessionRequest } from "@/features/auth/types";
export type Favorite = {
  id: string;
  restaurantId: string;
  groupId: string | null;
  restaurant: { id: string; name: string; address: string } | null;
};
export const favoritesKey = (accountId: string, groupId: string) =>
  ["user", accountId, "favorites", groupId] as const;
export const favoritesQuery = (
  request: SessionRequest,
  accountId: string,
  groupId: string,
) => ({
  queryKey: favoritesKey(accountId, groupId),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    request<Favorite[]>(
      `/api/v1/favorites${groupId ? `?groupId=${groupId}` : ""}`,
      { signal },
    ),
  retry: false as const,
  staleTime: 0,
  refetchOnMount: "always" as const,
});
export const saveFavorite = (
  request: SessionRequest,
  restaurantId: string,
  groupId: string,
  saved: boolean,
) =>
  request("/api/v1/favorites", {
    method: "POST",
    body: JSON.stringify({
      restaurantId,
      saved,
      ...(groupId ? { groupId } : {}),
    }),
  });
