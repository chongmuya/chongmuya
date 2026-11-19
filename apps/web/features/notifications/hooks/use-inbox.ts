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
) {
  const visible = useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
    () => false,
  );
  const query = useQuery({
    ...(countOnly ? unreadQuery(id, request) : inboxQuery(id, request, before)),
    refetchInterval: visible ? 30000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const { refetch } = query;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") void refetch();
    };
    if (visible) refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [visible, refetch]);
  return query;
}
