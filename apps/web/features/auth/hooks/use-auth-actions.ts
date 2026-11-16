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
  const submitting = useRef(false);
  // Passwords must not be retained in Query's mutation variables / Devtools.
  const credentials = useRef<Credentials | null>(null);
  const login = useMutation({
    mutationFn: async () => {
      const input = credentials.current;
      credentials.current = null;
      if (!input) return;
      try {
        const { email, password } = input;
        await client.login(email, password);
        if (client.getSnapshot().status !== "authenticated") return;
        notifySessionChange();
        if (active.current) router.refresh();
      } finally {
        submitting.current = false;
      }
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
  function signIn(values: Credentials, onError?: (error: Error) => void) {
    if (submitting.current || login.isPending || credentials.current) return;
    submitting.current = true;
    credentials.current = values;
    login.mutate(undefined, { onError });
  }
  return { login, logout, restore, signIn };
}
