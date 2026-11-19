import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/shared/http/request";
import type {
  Restaurant,
  RestaurantSummary,
  RestaurantMap,
} from "../types/restaurant.types";

function catalogParams(region: string, expectedGuests?: number, page?: number) {
  const params = new URLSearchParams({ region });
  if (page !== undefined) params.set("page", String(page));
  if (expectedGuests !== undefined)
    params.set("expectedGuests", String(expectedGuests));
  return params;
}
export const restaurantsQuery = (
  region = "",
  page = 1,
  expectedGuests?: number,
) =>
  queryOptions({
    queryKey: ["public", "restaurants", "list", region, page, expectedGuests],
    queryFn: ({ signal }) =>
      requestJson<{
        items: RestaurantSummary[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/api/v1/restaurants?${catalogParams(region, expectedGuests, page)}`, {
        signal,
      }),
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

export const restaurantMapQuery = (region = "", expectedGuests?: number) =>
  queryOptions({
    queryKey: ["public", "restaurants", "map", region, expectedGuests],
    queryFn: ({ signal }) =>
      requestJson<RestaurantMap[]>(
        `/api/v1/restaurants/map?${catalogParams(region, expectedGuests)}`,
        { signal },
      ),
    retry: false,
    staleTime: 0,
  });
