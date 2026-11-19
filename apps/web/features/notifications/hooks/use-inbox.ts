"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { inboxQuery, unreadQuery } from "../api/notifications.api";
const subscribe = (fn: () => void) => {
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
};
export function useInbox(
  id: string,
  request: SessionRequest,
  before?: string,
  countOnly = false,
  active = true,
  poll = true,
) {
  const visible = useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
    () => false,
  );
  const enabled = active && !!id && visible;
  const query = useQuery({
    ...(countOnly ? unreadQuery(id, request) : inboxQuery(id, request, before)),
    enabled,
    networkMode: "always",
    refetchInterval: enabled && poll ? 30000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { refetch } = query;
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState !== "hidden")
        void refetch({ cancelRefetch: false });
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [enabled, refetch]);
  return query;
}
