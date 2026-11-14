import { queryOptions } from "@tanstack/react-query";
import type { SessionClient } from "../lib/session-client";
import { getProfile } from "./auth.api";

export const profileQueryOptions = (
  client: SessionClient,
  accountId: string | undefined,
) =>
  queryOptions({
    queryKey: ["user", accountId, "profile"],
    queryFn: ({ signal }) => getProfile(client.request.bind(client), signal),
    enabled: !!accountId,
    staleTime: 0,
    retry: false,
  });
