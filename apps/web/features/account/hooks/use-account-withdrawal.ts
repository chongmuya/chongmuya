import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useAuth } from "@/features/auth/client";
import {
  completeWithdrawal,
  requestWithdrawal,
  withdrawalReceipt,
  withdrawalStatusQuery,
  type WithdrawalStatus,
} from "../api/withdrawal.api";

type Attempt = { accountId: string; key: string };

export function useWithdrawalReceipt(onComplete: (attempt: Attempt) => void) {
  const { client } = useAuth();
  return useMutation({
    mutationFn: async (attempt: Attempt) => {
      if (
        !(await withdrawalReceipt(client.request.bind(client), attempt.key))
          .completed
      )
        return false;
      onComplete(attempt);
      return true;
    },
  });
}

export function useWithdrawal(
  accountId: string,
  callbacks: {
    onAttempt: (key: string) => void;
    onComplete: (key: string) => void;
    onStateChange: () => void;
  },
) {
  const { client } = useAuth();
  const cache = useQueryClient();
  const completeKey = useRef<string>(null);
  const requestKey = useRef<string>(null);
  const request = client.request.bind(client);
  const options = withdrawalStatusQuery(request, accountId);
  const status = useQuery(options);
  const apply = async (value: WithdrawalStatus) => {
    if (client.getSnapshot().account?.id !== accountId) return;
    await cache.cancelQueries({ queryKey: options.queryKey });
    if (client.getSnapshot().account?.id !== accountId) return;
    cache.setQueryData(options.queryKey, value);
    callbacks.onStateChange();
  };
  const action = useMutation({
    mutationFn: async (kind: "complete" | "request") => {
      if (kind === "request") {
        requestKey.current ??= crypto.randomUUID();
        const state = await requestWithdrawal(request, requestKey.current);
        await apply(state);
        if (state.request?.reviewed) requestKey.current = null;
        return;
      }
      const key = (completeKey.current ??= crypto.randomUUID());
      callbacks.onAttempt(key);
      try {
        const result = await completeWithdrawal(request, key);
        if (result.completed) callbacks.onComplete(key);
        else await apply(result);
      } catch (error) {
        // A lost success response also ends the session on the server.
        const received = await withdrawalReceipt(request, key).catch(
          () => null,
        );
        if (received?.completed) callbacks.onComplete(key);
        else throw error;
      }
    },
  });
  return { status, action };
}
