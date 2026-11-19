"use client";
import {
  Suspense,
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SessionClient } from "../lib/session-client";

const Context = createContext<SessionClient | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [lost, setLost] = useState<{ accountId: string; ids: string[] }[]>([]);
  const [client] = useState(
    () =>
      new SessionClient(
        () => {
          setLost([]);
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
        (accountId, ids, denied) => {
          if (denied) setLost((previous) => [...previous, { accountId, ids }]);
          else
            setLost((previous) =>
              previous.filter(
                (scope) =>
                  scope.accountId !== accountId ||
                  !scope.ids.some((id) => ids.includes(id)),
              ),
            );
          const contains = (value: unknown): boolean => {
            if (typeof value === "string") return ids.includes(value);
            if (!value || typeof value !== "object") return false;
            return Object.values(value).some(contains);
          };
          const filter = {
            predicate: (query: {
              queryKey: readonly unknown[];
              state: { data: unknown };
            }) =>
              query.queryKey[0] === "user" &&
              query.queryKey[1] === accountId &&
              (contains(query.queryKey.slice(2)) || contains(query.state.data)),
          };
          void queryClient.cancelQueries(filter);
          queryClient.removeQueries(filter);
        },
      ),
  );
  useEffect(() => {
    void client.restore().catch(() => undefined);
    const channel = new BroadcastChannel("chongmuya-auth");
    channel.onmessage = () => {
      void client.restore().catch(() => undefined);
    };
    const authorityChannel = new BroadcastChannel("chongmuya-group-authority");
    authorityChannel.onmessage = (event) => {
      client.receiveAuthorityChange(event.data);
    };
    return () => {
      channel.close();
      authorityChannel.close();
    };
  }, [client]);
  return (
    <Context.Provider value={client}>
      <Suspense fallback={children}>
        <ResourceAuthorityBoundary client={client} lost={lost}>
          {children}
        </ResourceAuthorityBoundary>
      </Suspense>
    </Context.Provider>
  );
}
function ResourceAuthorityBoundary({
  client,
  lost,
  children,
}: {
  client: SessionClient;
  lost: { accountId: string; ids: string[] }[];
  children: ReactNode;
}) {
  const params = useSearchParams();
  const state = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const resources = ["group", "event", "schedule", "reservation"]
    .map((key) => params.get(key))
    .filter(Boolean);
  if (
    lost.some(
      (scope) =>
        scope.accountId === state.account?.id &&
        resources.some((id) => scope.ids.includes(id!)),
    )
  )
    return (
      <main className="mx-auto max-w-lg p-6" role="alert">
        <h1>이 모임의 관리 권한이 변경됐어요</h1>
        <p>
          현재 역할과 관리할 모임을 다시 확인해 주세요. 다른 모임과 개인 작업은
          그대로 유지돼요.
        </p>
        <Link href="/mypage">내 모임 확인하기</Link>
      </main>
    );
  return children;
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
