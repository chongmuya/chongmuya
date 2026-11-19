"use client";
import { useQueries } from "@tanstack/react-query";
import { restaurantQuery } from "../api/restaurants.api";
export const useSelectedRestaurants = (ids: string[]) =>
  useQueries({ queries: ids.map(restaurantQuery) });
