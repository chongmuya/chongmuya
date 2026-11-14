"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { ApiError } from "@/shared/http/api-error";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import {
  eventSchema,
  eventInput,
  type EventFormValues,
} from "../schemas/event.schema";
import { useCreateEvent } from "../hooks/use-create-event";

export function EventForm({
  accountId,
  groupId,
  request,
}: {
  accountId: string;
  groupId: string;
  request: SessionRequest;
}) {
  const id = useId();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: { name: "", date: "" },
  });
  const create = useCreateEvent(accountId, groupId, request);
  return (
    <form
      noValidate
      className="form-panel"
      onSubmit={handleSubmit((values) => {
        if (create.isPending) return;
        create.mutate(eventInput(values), {
          onSuccess: (event) => {
            reset();
            router.push(
              `/events?group=${encodeURIComponent(groupId)}&event=${encodeURIComponent(event.id)}`,
            );
          },
        });
      })}
    >
      <h2>행사 만들기</h2>
      <div>
        <label htmlFor={`${id}-name`}>행사명</label>
        <Input
          id={`${id}-name`}
          {...register("name")}
          required
          maxLength={100}
          disabled={create.isPending}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
        />
        <FormError id={`${id}-name-error`} message={errors.name?.message} />
      </div>
      <div>
        <label htmlFor={`${id}-date`}>일정 (선택 · 한국 시간)</label>
        <Input
          id={`${id}-date`}
          type="datetime-local"
          {...register("date")}
          disabled={create.isPending}
          aria-invalid={!!errors.date}
          aria-describedby={errors.date ? `${id}-date-error` : undefined}
        />
        <FormError id={`${id}-date-error`} message={errors.date?.message} />
      </div>
      <Button
        type="submit"
        disabled={create.isPending}
        aria-busy={create.isPending}
      >
        {create.isPending ? "저장 중…" : "행사 만들기"}
      </Button>
      <FormError
        message={
          create.isError
            ? create.error instanceof ApiError && create.error.status === 400
              ? "입력한 이름과 일정을 확인해 주세요."
              : "저장하지 못했습니다. 연결과 권한을 확인하고 다시 시도해 주세요."
            : undefined
        }
      />
    </form>
  );
}
