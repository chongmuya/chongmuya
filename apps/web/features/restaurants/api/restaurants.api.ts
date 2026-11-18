import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/shared/http/request";
import type {
  Restaurant,
  RestaurantSummary,
  RestaurantMap,
} from "../types/restaurant.types";

export const restaurantsQuery = (region = "", page = 1) =>
  queryOptions({
    queryKey: ["public", "restaurants", "list", region, page],
    queryFn: ({ signal }) =>
      requestJson<{
        items: RestaurantSummary[];
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

export const restaurantMapQuery = (region = "") =>
  queryOptions({
    queryKey: ["public", "restaurants", "map", region],
    queryFn: ({ signal }) =>
      requestJson<RestaurantMap[]>(
        `/api/v1/restaurants/map?${new URLSearchParams({ region })}`,
        { signal },
      ),
    retry: false,
    staleTime: 0,
  });
