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
  const [base, setBase] = useState(event),
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
  const changed = event.version !== base.version;
  return (
    <BottomSheet title="행사 수정" onClose={onClose}>
      <form
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) => {
          if (changed) return;
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
          );
        })}
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
            재문의에서 날짜·인원을 바꿀 수 있어요. 선택한 예약의 일정 변경은
            예약 관리에서 변경을 제안하고 상대의 확인을 받아 주세요.
          </p>
        )}
        {changed && (
          <div
            role="alert"
            className="space-y-3 rounded-control bg-choice p-4 text-sm"
          >
            <p>다른 화면에서 행사가 변경됐어요. 작성한 입력은 유지됩니다.</p>
            <p>
              최신 행사: {event.name} ·{" "}
              {event.scheduledAt
                ? new Date(event.scheduledAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })
                : "일정 미정"}
            </p>
            {event.reservationScheduleLocked && (
              <p>현재 일정은 예약으로 잠겨 있어 이름만 재적용할 수 있어요.</p>
            )}
            <Button
              disabled={save.isPending}
              onClick={() => {
                setBase(event);
                save.reset();
              }}
            >
              최신 내용 확인 후 내 입력 재적용
            </Button>
          </div>
        )}
        <FormError
          message={save.error ? safeErrorMessage(save.error) : undefined}
        />
        <Button
          type="submit"
          className="w-full"
          loading={save.isPending}
          disabled={changed}
        >
          저장
        </Button>
      </form>
    </BottomSheet>
  );
}
