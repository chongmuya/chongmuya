"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import type { Event } from "../types/event.types";
import { eventSchema, eventInput } from "../schemas/event.schema";
import { useUpdateEvent } from "../hooks/use-update-event";

export function EditEvent({
  event,
  accountId,
  request,
  onClose,
}: {
  event: Event;
  accountId: string;
  request: SessionRequest;
  onClose: () => void;
}) {
  const [base] = useState(event),
    active = useActiveScreen();
  const local = base.scheduledAt
    ? new Date(Date.parse(base.scheduledAt) + 9 * 3600_000).toISOString()
    : "";
  const form = useForm({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: base.name,
      date: local.slice(0, 10),
      time: local.slice(11, 16),
    },
  });
  const save = useUpdateEvent(accountId, event.id, request);
  return (
    <BottomSheet title="행사 수정" onClose={onClose}>
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) =>
          save.mutate(
            {
              name: values.name,
              expectedVersion: base.version,
              ...(!base.reservationScheduleLocked
                ? { scheduledAt: eventInput(values).scheduledAt ?? null }
                : {}),
            },
            {
              onSuccess: () => {
                if (active.current) onClose();
              },
            },
          ),
        )}
      >
        {(["name", "date", "time"] as const).map((key) => (
          <FormField
            key={key}
            id={`edit-event-${key}`}
            label={
              { name: "행사 이름", date: "날짜 (한국 시간)", time: "시간" }[key]
            }
            error={form.formState.errors[key]?.message}
          >
            {(attrs) => (
              <Input
                {...attrs}
                {...form.register(key)}
                type={key === "name" ? "text" : key}
                disabled={
                  save.isPending ||
                  (key !== "name" && base.reservationScheduleLocked)
                }
                variant="form"
              />
            )}
          </FormField>
        ))}
        {base.reservationScheduleLocked && (
          <p className="rounded-control bg-choice p-4 text-sm">
            발송한 문의 또는 선택한 매장의 일정을 유지하고 있어요. 모두 종료되면
            재문의에서 날짜·인원을 바꿀 수 있어요. 선택한 예약의 일정 변경
            기능은 준비 중이에요.
          </p>
        )}
        <FormError
          message={save.error ? safeErrorMessage(save.error) : undefined}
        />
        <Button type="submit" className="w-full" loading={save.isPending}>
          저장
        </Button>
      </form>
    </BottomSheet>
  );
}
