"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { notifySessionChange, useAuth } from "../components/auth-provider";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import type { Credentials } from "../schemas/credentials.schema";

export function useAuthActions() {
  const { client } = useAuth();
  const router = useRouter();
  const active = useActiveScreen();
  // Passwords must not be retained in Query's mutation variables / Devtools.
  const credentials = useRef<
    (Credentials & { mode: "login" | "signup" }) | null
  >(null);
  const login = useMutation({
    mutationFn: async () => {
      const input = credentials.current;
      credentials.current = null;
      if (!input) return;
      const { mode, email, password } = input;
      await client.login(mode, email, password);
      if (client.getSnapshot().status !== "authenticated") return;
      notifySessionChange();
      if (active.current) router.refresh();
    },
    retry: false,
    gcTime: 0,
  });
  const logout = useMutation({
    mutationFn: async () => {
      await client.logout();
      notifySessionChange();
      router.refresh();
    },
    retry: false,
  });
  const restore = useMutation({
    mutationFn: () => client.restore(),
    retry: false,
  });
  function signIn(
    mode: "login" | "signup",
    values: Credentials,
    onError?: (error: Error) => void,
  ) {
    if (login.isPending || credentials.current) return;
    credentials.current = { mode, ...values };
    login.mutate(undefined, { onError });
  }
  return { login, logout, restore, signIn };
}
