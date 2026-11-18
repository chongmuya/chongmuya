"use client";
import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { saveDraft, getDraft, ownerKey } from "../api/owner.api";
import {
  registrationSchema,
  type RegistrationData,
} from "../schemas/registration.schema";
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
  const [conflict, setConflict] = useState<RestaurantDraft | null>(null);
  const conflictRef = useRef<RestaurantDraft | null>(null);
  const latest = useCallback(async () => {
    const current = await getDraft(request, draft.id);
    if (!active.current) throw new Error("Screen left");
    return current;
  }, [active, draft.id, request]);
  const review = useCallback((current: RestaurantDraft | null) => {
    conflictRef.current = current;
    setConflict(current);
  }, []);
  const recover = useCallback(async () => {
    try {
      review(await latest());
    } catch (e) {
      if (active.current) setError(e);
    }
  }, [active, latest, review]);
  const mutation = useMutation({
    mutationKey: [...ownerKey(accountId), "draft-save", draft.id],
    retry: false,
    gcTime: 0,
    mutationFn: async (input: {
      data: RegistrationData;
      step: number;
      addressId?: string;
      resume?: boolean;
    }) => {
      const reviewed = conflictRef.current;
      if (reviewed && !input.resume)
        throw new ApiError("", 409, "RESTAURANT_VERSION_CONFLICT");
      const expected =
        input.resume && reviewed ? reviewed.version : version.current;
      try {
        const result = await saveDraft(request, draft.id, {
          data: input.data,
          step: input.step,
          addressId: input.addressId,
          version: expected,
          ...(input.resume && reviewed?.currentRestaurant
            ? { restaurantVersion: reviewed.currentRestaurant.version }
            : {}),
        });
        return result;
      } catch (e) {
        if (!active.current) throw e;
        // Read after a lost response too. Matching saved content proves success; differing
        // content always needs explicit review before using the newer version.
        const current = await latest().catch(() => null);
        if (current) {
          if (current.submitted) return current;
          const stored = registrationSchema.parse(current.data);
          const submitted = registrationSchema.parse(input.data);
          if (
            current.version > expected &&
            current.step === input.step &&
            JSON.stringify(stored) === JSON.stringify(submitted) &&
            (!input.addressId ||
              current.selectedAddress?.id === input.addressId) &&
            (!input.resume ||
              !reviewed?.currentRestaurant ||
              current.restaurantVersion === reviewed.currentRestaurant.version)
          )
            return current;
          if (current.version !== expected || input.resume) review(current);
        }
        throw e;
      }
    },
  });
  const mutateAsync = mutation.mutateAsync;
  const save = useCallback(
    (
      data: RegistrationData,
      step: number,
      addressId?: string,
      resume = false,
    ) => {
      let result: RestaurantDraft;
      const run = chain.current
        .catch(() => undefined)
        .then(async () => {
          if (!active.current) throw new Error("Screen left");
          try {
            result = await mutateAsync({ data, step, addressId, resume });
            if (active.current) {
              version.current = result.version;
              setError(null);
              review(null);
            }
          } catch (e) {
            if (active.current) setError(e);
            throw e;
          }
        });
      chain.current = run;
      return run.then(() => result!);
    },
    [active, mutateAsync, review],
  );
  return {
    save,
    recover,
    conflict,
    error,
    pending: mutation.isPending,
    version,
  };
}
