"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@/shared/ui/states";
import { authEntryPath } from "../lib/auth-entry-path";
import { safeReturnPath } from "../lib/return-path";
import { useAuth } from "./auth-provider";
import { AuthScreen } from "./auth-screen";
import { LoginScreen } from "./login-screen";
import { StartScreen } from "./start-screen";

// Entry routing is separate from the account and recovery panel used in workspace screens.
export function AuthEntryScreen({ screen }: { screen: "start" | "login" }) {
  const { status } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const returnTo = safeReturnPath(params.get("next"));
  const legacySignup = screen === "login" && params.get("mode") === "signup";
  useEffect(() => {
    if (legacySignup) router.replace(authEntryPath("/auth/signup", returnTo));
    else if (status === "authenticated") router.replace(returnTo);
  }, [status, returnTo, router, legacySignup]);
  if (legacySignup || status === "loading" || status === "authenticated")
    return (
      <main className="app-page">
        <LoadingState>
          {status === "loading"
            ? "로그인 상태 확인 중…"
            : "내 화면으로 이동 중…"}
        </LoadingState>
      </main>
    );
  if (status !== "anonymous")
    return (
      <main className="app-page">
        <AuthScreen />
      </main>
    );
  return screen === "start" ? (
    <StartScreen returnTo={returnTo} />
  ) : (
    <LoginScreen key={returnTo} returnTo={returnTo} />
  );
}
