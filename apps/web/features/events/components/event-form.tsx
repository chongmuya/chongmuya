"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { useGroups } from "@/features/groups/client";
import { Select } from "@/shared/ui/select";
import { ErrorState } from "@/shared/ui/states";
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
  groupId = "",
  request,
}: {
  accountId: string;
  groupId?: string;
  request: SessionRequest;
}) {
  const id = useId();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: { name: "", date: "", groupId },
  });
  const create = useCreateEvent(accountId, request);
  const groups = useGroups(accountId, request);
  return (
    <form
      noValidate
      className="form-panel"
      onSubmit={handleSubmit((values) => {
        if (create.isPending) return;
        clearErrors();
        create.mutate(eventInput(values), {
          onError: (error) =>
            applyFormError(error, setError, {
              name: "name",
              scheduledAt: "date",
              groupId: "groupId",
            }),
          onSuccess: (event) => {
            reset();
            router.push(`/events?event=${encodeURIComponent(event.id)}`);
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
      <div>
        <label htmlFor={`${id}-group`}>모임 (선택)</label>
        <Select
          id={`${id}-group`}
          {...register("groupId")}
          disabled={create.isPending}
          aria-invalid={!!errors.groupId}
          aria-describedby={errors.groupId ? `${id}-group-error` : undefined}
        >
          <option value="">모임 없이 개인 행사</option>
          {!groups.isError &&
            groups.data?.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
        </Select>
        <FormError id={`${id}-group-error`} message={errors.groupId?.message} />
        {groups.isError ? (
          <ErrorState retry={() => void groups.refetch()}>
            모임을 불러오지 못했습니다. 개인 행사는 만들 수 있습니다.
          </ErrorState>
        ) : !groups.data ? (
          <p role="status">모임 확인 중…</p>
        ) : !groups.data.length ? (
          <p>모임이 없어도 개인 행사를 만들 수 있습니다.</p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={create.isPending}
        aria-busy={create.isPending}
      >
        {create.isPending ? "저장 중…" : "행사 만들기"}
      </Button>
      <FormError message={errors.root?.server?.message} />
    </form>
  );
}
