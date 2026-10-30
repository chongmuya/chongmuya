"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SessionClient } from "./session";

const Context = createContext<SessionClient | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(
    () =>
      new SessionClient(
        () => {
          const filter = {
            predicate: (query: { queryKey: readonly unknown[] }) =>
              query.queryKey[0] === "user",
          };
          void queryClient.cancelQueries(filter);
          queryClient.removeQueries(filter);
          queryClient.getMutationCache().clear();
        },
        undefined,
        async (action) =>
          typeof navigator !== "undefined" && navigator.locks
            ? await navigator.locks.request("chongmuya-auth", action)
            : action(),
      ),
  );
  useEffect(() => {
    void client.restore().catch(() => undefined);
    const channel = new BroadcastChannel("chongmuya-auth");
    channel.onmessage = () => {
      void client.restore().catch(() => undefined);
    };
    return () => channel.close();
  }, [client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useAuth() {
  const client = useContext(Context);
  if (!client) throw new Error("AuthProvider is required");
  const state = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  return { client, ...state };
}
export function notifySessionChange() {
  const channel = new BroadcastChannel("chongmuya-auth");
  channel.postMessage("changed");
  channel.close();
}
