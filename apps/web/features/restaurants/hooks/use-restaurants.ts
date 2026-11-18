"use client";
import { useQueries, useQuery } from "@tanstack/react-query";
import { restaurantQuery } from "../api/restaurants.api";
export const useRestaurant = (id?: string) =>
  useQuery({ ...restaurantQuery(id ?? ""), enabled: !!id });
export const useSelectedRestaurants = (ids: string[]) =>
  useQueries({ queries: ids.map(restaurantQuery) });
