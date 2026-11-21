"use client";
import { useQueries, type QueryClient } from "@tanstack/react-query";
import { restaurantQuery } from "../api/restaurants.api";
import type { Restaurant } from "../types/restaurant.types";

export const useSelectedRestaurants = (ids: string[]) =>
  useQueries({ queries: ids.map(restaurantQuery) });

export function restaurantInquiryIssue(
  result:
    | {
        status: "pending" | "error" | "success";
        fetchStatus: "fetching" | "paused" | "idle";
        data: Restaurant | undefined;
      }
    | undefined,
  expectedGuests?: number,
) {
  if (!result || result.fetchStatus === "fetching") return "loading";
  if (result.status === "error" || result.fetchStatus === "paused")
    return "error";
  if (result.status === "pending") return "loading";
  if (!result.data?.inquiryAvailable) return "unavailable";
  if (
    expectedGuests !== undefined &&
    (result.data.maxCapacity === null ||
      result.data.maxCapacity < expectedGuests)
  )
    return "capacity";
}

export function canInquireAtRestaurants(
  cache: QueryClient,
  ids: string[],
  expectedGuests: number,
) {
  return ids.every(
    (id) =>
      !restaurantInquiryIssue(
        cache.getQueryState<Restaurant>(restaurantQuery(id).queryKey),
        expectedGuests,
      ),
  );
}
