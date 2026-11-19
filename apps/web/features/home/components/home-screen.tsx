"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthEntryScreen,
  SplashScreen,
  postLoginPath,
  useAuth,
} from "@/features/auth/client";
import { AccountHome } from "./account-home";

// The root is the entry screen until a session is restored. Public browsing
// starts explicitly from StartScreen; a second anonymous dashboard is unnecessary.
export function HomeScreen() {
  const { account, status, client } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const destination = account
    ? account.accountType === "owner"
      ? "/owner"
      : postLoginPath(account, params.size ? `/?${params}` : "/")
    : null;
  useEffect(() => {
    if (
      status === "authenticated" &&
      destination &&
      !destination.startsWith("/?") &&
      destination !== "/"
    )
      router.replace(destination);
  }, [status, destination, router]);
  if (status !== "authenticated" || !account)
    return <AuthEntryScreen screen="start" />;
  if (destination !== "/" && !destination?.startsWith("/?"))
    return <SplashScreen />;
  return (
    <AccountHome
      key={account.id}
      account={account}
      request={client.request.bind(client)}
    />
  );
}
