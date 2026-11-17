"use client";
import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/client";
import type { FirstSetupInput } from "@/features/auth/types";
export function useFirstSetup() {
  const { client, account } = useAuth();
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const mutation = useMutation({
    mutationFn: async (input: FirstSetupInput) => {
      if (controller.current) return;
      const current = new AbortController();
      controller.current = current;
      try {
        await client.saveFirstSetup(input, current.signal);
      } finally {
        if (controller.current === current) controller.current = null;
      }
    },
    retry: false,
    gcTime: 0,
    mutationKey: ["user", account?.id, "first-setup"],
  });
  return mutation;
}
