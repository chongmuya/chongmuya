"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthScreen, safeReturnPath, useAuth } from "@/features/auth/client";
import { buttonStyles } from "@/shared/ui/button";
import { LoadingState } from "@/shared/ui/states";
import { GettingStartedFlow } from "./getting-started-flow";

export function GettingStartedScreen() {
  const { status, account, client } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const requested = safeReturnPath(params.get("next"));
  const returnTo = requested === "/getting-started" ? "/events" : requested;
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
        <Link className={buttonStyles()} href="/auth?next=%2Fgetting-started">
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
