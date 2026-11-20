"use client";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ApiError } from "@/shared/http/api-error";
import { completionKey, executeCompletion } from "../api/completion.api";
import type { CompletionAccess } from "../types/completion.types";
type Command = { action: string; input: Record<string, unknown> };
// Only an explicit, recognized rejection proves that this attempt did not apply.
const rejected = (error: unknown) =>
  error instanceof ApiError &&
  error.code !== "HTTP_ERROR" &&
  [400, 401, 403, 404, 409, 429].includes(error.status);
export function useCompletionCommand(id: string, access: CompletionAccess) {
  const cache = useQueryClient(),
    active = useActiveScreen(),
    attempt = useRef<(Command & { requestKey: string }) | null>(null),
    [uncertain, setUncertain] = useState(false);
  const mutation = useMutation({
    mutationFn: (command: Command) => {
      // A read with a newer version cannot turn an unresolved write into a new command.
      attempt.current ??= {
        ...structuredClone(command),
        requestKey: crypto.randomUUID(),
      };
      const frozen = attempt.current;
      return executeCompletion(id, access, frozen.action, {
        ...frozen.input,
        requestKey: frozen.requestKey,
      });
    },
    retry: false,
    networkMode: "always",
    onSuccess: async (data) => {
      attempt.current = null;
      if (!active.current) return;
      setUncertain(false);
      await cache.cancelQueries({
        queryKey: completionKey(id, access),
        exact: true,
      });
      if (!active.current) return;
      cache.setQueryData(completionKey(id, access), data);
      if (access.kind !== "link") {
        void cache.invalidateQueries({
          queryKey: ["user", access.accountId, "calendar"],
        });
        void cache.invalidateQueries({
          queryKey: ["user", access.accountId, "events"],
        });
        if (access.kind === "organizer" && data.cancellation)
          void cache.invalidateQueries({
            queryKey: [
              "user",
              access.accountId,
              "reservation-request",
              data.eventId,
            ],
          });
        void cache.invalidateQueries({
          queryKey: ["user", access.accountId, "owner", "reservations"],
        });
      }
    },
    onError: (error) => {
      if (rejected(error)) attempt.current = null;
      if (active.current) {
        setUncertain(!rejected(error));
        void cache.invalidateQueries({ queryKey: completionKey(id, access) });
      }
    },
  });
  const retryUncertain = () => {
    if (!attempt.current) throw new Error("NO_PENDING_COMMAND");
    return mutation.mutateAsync(attempt.current);
  };
  return { ...mutation, active, uncertain, retryUncertain };
}
