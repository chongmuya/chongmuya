"use client";
import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { ownerWrite, ownerKey } from "../api/owner.api";
import type { RegistrationData } from "../schemas/registration.schema";
import type { RestaurantDraft } from "../types/owner.types";
export function useDraftSave(
  accountId: string,
  request: SessionRequest,
  draft: RestaurantDraft,
) {
  const version = useRef(draft.version),
    active = useActiveScreen(),
    chain = useRef(Promise.resolve());
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationKey: [...ownerKey(accountId), "draft-save", draft.id],
    retry: false,
    gcTime: 0,
    mutationFn: (input: {
      data: RegistrationData;
      step: number;
      addressId?: string;
    }) =>
      ownerWrite<RestaurantDraft>(
        request,
        `drafts/${draft.id}`,
        { ...input, version: version.current },
        "PUT",
      ),
  });
  const mutateAsync = mutation.mutateAsync;
  const save = useCallback(
    (data: RegistrationData, step: number, addressId?: string) => {
      let result: RestaurantDraft;
      const run = chain.current
        .catch(() => undefined)
        .then(async () => {
          if (!active.current) throw new Error("Screen left");
          try {
            result = await mutateAsync({ data, step, addressId });
            if (active.current) {
              version.current = result.version;
              setError(null);
            }
          } catch (e) {
            if (active.current) setError(e);
            throw e;
          }
        });
      chain.current = run;
      return run.then(() => result!);
    },
    [active, mutateAsync],
  );
  return { save, error, pending: mutation.isPending, version };
}
