"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthEntryScreen,
  SplashScreen,
  authEntryPath,
  postLoginPath,
  useAuth,
} from "@/features/auth/client";
import { LoadingState } from "@/shared/ui/states";
import { AccountHome } from "./account-home";
import { useHomeEntry } from "./home-entry-provider";

export function HomeScreen() {
  const { account, status, client } = useAuth();
  const { phase, complete } = useHomeEntry();
  const router = useRouter();
  const params = useSearchParams();
  const rootPath = params.size ? `/?${params}` : "/";
  const destination =
    status === "anonymous" && phase === "ready"
      ? authEntryPath("/intro", params.get("next") ?? rootPath)
      : status === "authenticated" && account
        ? account.accountType === "owner"
          ? "/owner"
          : postLoginPath(account, rootPath)
        : null;
  const redirectTo = destination?.split("?")[0] === "/" ? null : destination;

  useEffect(() => {
    if (phase === "splash") return;
    if (redirectTo) router.replace(redirectTo);
    else if (phase === "ready" && status === "authenticated") complete();
  }, [phase, redirectTo, status, router, complete]);

  if (
    phase === "splash" ||
    status === "loading" ||
    (phase === "ready" && redirectTo)
  )
    return <SplashScreen />;
  if (redirectTo)
    return (
      <main className="app-page">
        <LoadingState>내 화면으로 이동 중…</LoadingState>
      </main>
    );
  if (status !== "authenticated" || !account)
    return <AuthEntryScreen screen="start" />;
  return (
    <AccountHome
      key={account.id}
      account={account}
      request={client.request.bind(client)}
    />
  );
}
