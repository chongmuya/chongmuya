import { queryOptions } from "@tanstack/react-query";
import { getHealth } from "./api";

export const healthQueryOptions = queryOptions({
  queryKey: ["health"],
  queryFn: ({ signal }) => getHealth(signal),
  staleTime: 0,
  retry: false,
  refetchInterval: 5_000,
  refetchIntervalInBackground: false,
});
