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
import { SessionClient } from "../lib/session-client";

const Context = createContext<SessionClient | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authorityLost, setAuthorityLost] = useState(false);
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
        () => setAuthorityLost(true),
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
      if (event.data?.source !== client.instanceId)
        client.invalidateAuthority();
    };
    return () => {
      channel.close();
      authorityChannel.close();
    };
  }, [client]);
  return (
    <Context.Provider value={client}>
      {authorityLost ? (
        <main className="mx-auto max-w-lg p-6" role="alert">
          <h1>관리 권한을 다시 확인해 주세요</h1>
          <p>
            권한이 변경됐거나 더 이상 접근할 수 없는 자료예요. 열려 있던 관리
            화면과 저장된 조회 정보를 비웠어요.
          </p>
          <button
            type="button"
            onClick={() =>
              location.assign(new URL("/mypage", location.origin).href)
            }
          >
            현재 권한으로 내 모임 다시 열기
          </button>
        </main>
      ) : (
        children
      )}
    </Context.Provider>
  );
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
