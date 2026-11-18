"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import type { RestaurantDraft, PhoneChallenge } from "../types/owner.types";
import type { VerifiedAddress } from "../schemas/registration.schema";
import * as api from "../api/owner.api";

// Search/verification results belong to this draft; they do not invalidate the owner catalog.
export function useDraftIdentity(
  request: SessionRequest,
  draft: RestaurantDraft,
) {
  const active = useActiveScreen(),
    searchSequence = useRef(0);
  const [addresses, setAddresses] = useState<VerifiedAddress[]>([]),
    [addressId, setAddressId] = useState<string>();
  const [searchNotice, setSearchNotice] = useState("");
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null),
    [verifiedPhone, setVerifiedPhone] = useState(draft.verifiedPhone);
  const search = useMutation({
    mutationFn: (query: string) => api.searchAddress(request, draft.id, query),
    retry: false,
    gcTime: 0,
  });
  const start = useMutation({
    mutationFn: (phone: string) =>
      api.startContactVerification(request, draft.id, phone),
    retry: false,
    gcTime: 0,
  });
  const check = useMutation({
    mutationFn: (value: PhoneChallenge) =>
      api.checkContactVerification(request, draft.id, {
        phone: value.phone,
        verificationId: value.id,
      }),
    retry: false,
    gcTime: 0,
  });
  return {
    addresses,
    setAddresses,
    addressId,
    setAddressId,
    searchNotice,
    setSearchNotice,
    challenge,
    verifiedPhone,
    busy: search.isPending || start.isPending || check.isPending,
    error: search.error ?? start.error ?? check.error,
    search: async (query: string) => {
      const sequence = ++searchSequence.current;
      const result = await search.mutateAsync(query);
      if (active.current && sequence === searchSequence.current) {
        setAddresses(result.results);
        setSearchNotice(
          result.results.length
            ? "검색한 주소를 선택해 주세요."
            : "검색 결과가 없어요. 주소를 수정해 다시 검색해 주세요.",
        );
      }
    },
    start: async (phone: string) => {
      const result = await start.mutateAsync(phone);
      if (active.current) setChallenge(result);
    },
    check: async () => {
      if (!challenge) return;
      const result = await check.mutateAsync(challenge);
      if (active.current && result.status === "verified") {
        setVerifiedPhone(challenge.phone);
        setChallenge(null);
      }
    },
  };
}
