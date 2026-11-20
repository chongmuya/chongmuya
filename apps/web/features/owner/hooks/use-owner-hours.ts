"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { hoursQuery, saveHours, type HoursData } from "../api/hours.api";
import { hoursSchema, type HoursFields } from "../schemas/hours.schema";
export function useOwnerHours(
  accountId: string,
  restaurantId: string,
  request: SessionRequest,
  latest: HoursData,
  refresh: () => void,
) {
  const [base, setBase] = useState(latest.version),
    active = useActiveScreen(),
    cache = useQueryClient();
  const form = useForm({
    resolver: zodResolver(hoursSchema),
    defaultValues: latest.hours,
  });
  const days = useWatch({ control: form.control, name: "days" });
  const save = useMutation({
    mutationFn: (v: HoursFields) => saveHours(request, restaurantId, base, v),
    onSuccess: (r) => {
      if (active.current) {
        setBase(r.version);
        cache.setQueryData(
          hoursQuery(accountId, restaurantId, request).queryKey,
          r,
        );
      }
    },
    onError: () => {
      if (active.current) refresh();
    },
    retry: false,
  });
  return { base, setBase, form, days, save };
}
