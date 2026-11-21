"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { SessionRequest } from "@/features/auth/types";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { guestCountSchema } from "@/shared/lib/guest-count";
import { Button } from "@/shared/ui/button";
import { FormError } from "@/shared/ui/form-error";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { useUpdateEvent } from "../hooks/use-update-event";
import type { Event } from "../types/event.types";

const schema = z.object({ expectedGuests: guestCountSchema });

export function EventGuestEstimateForm({
  accountId,
  event,
  request,
}: {
  accountId: string;
  event: Event;
  request: SessionRequest;
}) {
  const active = useActiveScreen();
  const update = useUpdateEvent(accountId, event.id, request);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { expectedGuests: "" },
  });
  return (
    <form
      noValidate
      className="space-y-5 rounded-control bg-surface px-[22px] py-7 shadow-card"
      onSubmit={handleSubmit(({ expectedGuests }) => {
        if (update.isPending) return;
        update.mutate(
          {
            expectedVersion: event.version,
            expectedGuests: Number(expectedGuests),
          },
          {
            onError: (error) => {
              if (active.current)
                applyFormError(error, setError, {
                  expectedGuests: "expectedGuests",
                });
            },
          },
        );
      })}
    >
      <FormField
        id="event-guest-estimate"
        label="예상 인원"
        required
        hint="이 행사에서 매장을 찾고 문의할 때 사용할 인원이에요."
        error={errors.expectedGuests?.message}
      >
        {(attrs) => (
          <Input
            {...attrs}
            {...register("expectedGuests")}
            variant="form"
            inputMode="numeric"
            placeholder="예) 17"
            maxLength={6}
            disabled={update.isPending}
          />
        )}
      </FormField>
      <FormError message={errors.root?.server?.message} />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={update.isPending}
          aria-busy={update.isPending}
        >
          {update.isPending ? "저장 중…" : "저장하고 계속하기"}
        </Button>
      </div>
    </form>
  );
}
