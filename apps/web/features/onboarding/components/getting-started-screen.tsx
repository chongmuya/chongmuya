"use client";

import { useEffect, useState } from "react";
import type { Account } from "@/features/auth/types";
import { FirstSetupForm } from "./first-setup-form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthScreen,
  safeReturnPath,
  useAuth,
  isFirstSetupComplete,
} from "@/features/auth/client";
import { buttonStyles } from "@/shared/ui/button";
import { LoadingState } from "@/shared/ui/states";
import { GettingStartedFlow } from "./getting-started-flow";

export function GettingStartedScreen() {
  const { status, account } = useAuth();
  const params = useSearchParams();
  const requested = safeReturnPath(params.get("next") ?? "/");
  const returnTo = requested.startsWith("/getting-started")
    ? "/events"
    : requested;
  if (status === "loading")
    return (
      <main className="app-page">
        <LoadingState>로그인 상태 확인 중…</LoadingState>
      </main>
    );
  if (status === "anonymous")
    return (
      <main className="app-page">
        <h1>로그인이 필요합니다</h1>
        <Link
          className={buttonStyles()}
          href={`/auth?next=${encodeURIComponent(`/getting-started?next=${encodeURIComponent(returnTo)}`)}`}
        >
          로그인하고 이어서 시작하기
        </Link>
      </main>
    );
  if (status !== "authenticated" || !account)
    return (
      <main className="app-page">
        <AuthScreen />
      </main>
    );
  return (
    <GettingStartedContent
      key={`${account.id}:${returnTo}`}
      account={account}
      returnTo={returnTo}
      guide={params.get("guide") === "1"}
    />
  );
}
function GettingStartedContent({
  account,
  returnTo,
  guide,
}: {
  account: Account;
  returnTo: string;
  guide: boolean;
}) {
  const { client } = useAuth();
  const router = useRouter();
  const [showGuide] = useState(() => guide || !isFirstSetupComplete(account));
  const complete = isFirstSetupComplete(account);
  useEffect(() => {
    if (complete && !showGuide) router.replace(returnTo);
  }, [complete, showGuide, returnTo, router]);
  if (!complete) return <FirstSetupForm onExit={() => router.push("/")} />;
  if (!showGuide)
    return (
      <main className="app-page">
        <LoadingState>원래 화면으로 이동 중…</LoadingState>
      </main>
    );
  return (
    <GettingStartedFlow
      key={`${account.id}:${account.accountType}:${returnTo}`}
      accountType={account.accountType}
      returnTo={returnTo}
      onNavigate={(path) => {
        const current = client.getSnapshot();
        if (
          current.status === "authenticated" &&
          current.account?.id === account.id
        )
          router.push(safeReturnPath(path));
      }}
    />
  );
}
