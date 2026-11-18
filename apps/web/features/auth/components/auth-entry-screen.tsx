"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@/shared/ui/states";
import { authEntryPath } from "../lib/auth-entry-path";
import { postLoginPath } from "../lib/first-setup";
import { safeReturnPath } from "../lib/return-path";
import { useAuth } from "./auth-provider";
import { AuthScreen } from "./auth-screen";
import { LoginScreen } from "./login-screen";
import { StartScreen } from "./start-screen";
import { SplashScreen } from "./splash-screen";

// Entry routing is separate from the account and recovery panel used in workspace screens.
export function AuthEntryScreen({ screen }: { screen: "start" | "login" }) {
  const { status, account } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const returnTo = safeReturnPath(params.get("next") ?? "/");
  const legacySignup = screen === "login" && params.get("mode") === "signup";
  useEffect(() => {
    if (legacySignup) router.replace(authEntryPath("/auth/signup", returnTo));
    else if (status === "authenticated" && account)
      router.replace(postLoginPath(account, returnTo));
  }, [status, account, returnTo, router, legacySignup]);
  if (status === "loading") return <SplashScreen />;
  if (legacySignup || status === "authenticated")
    return (
      <main className="app-page">
        <LoadingState>내 화면으로 이동 중…</LoadingState>
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
