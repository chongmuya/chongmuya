import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/shared/http/request";
import type { Restaurant } from "../types/restaurant.types";

export const restaurantsQuery = (region = "", page = 1) =>
  queryOptions({
    queryKey: ["public", "restaurants", "list", region, page],
    queryFn: ({ signal }) =>
      requestJson<{
        items: Restaurant[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/api/v1/restaurants?${new URLSearchParams({ region, page: String(page) })}`,
        { signal },
      ),
    staleTime: 0,
    retry: false,
  });
export const restaurantQuery = (id: string) =>
  queryOptions({
    queryKey: ["public", "restaurants", "detail", id],
    queryFn: ({ signal }) =>
      requestJson<Restaurant>(`/api/v1/restaurants/${encodeURIComponent(id)}`, {
        signal,
      }),
    staleTime: 0,
    retry: false,
  });
