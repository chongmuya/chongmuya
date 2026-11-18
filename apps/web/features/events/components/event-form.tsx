"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { useGroups } from "@/features/groups/client";
import { Select } from "@/shared/ui/select";
import { ErrorState } from "@/shared/ui/states";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import Image from "next/image";
import { FormError } from "@/shared/ui/form-error";
import {
  eventSchema,
  eventInput,
  type EventFormValues,
} from "../schemas/event.schema";
import { useCreateEvent } from "../hooks/use-create-event";

const unconfirmedGroup = "unconfirmed";

export function EventForm({
  accountId,
  groupId = "",
  request,
  onCreated,
}: {
  accountId: string;
  groupId?: string;
  request: SessionRequest;
  onCreated?: (event: { id: string }) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [findVenue, setFindVenue] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      date: "",
      groupId: groupId ? unconfirmedGroup : "",
    },
  });
  const { field: groupField } = useController({ name: "groupId", control });
  const create = useCreateEvent(accountId, request);
  const groups = useGroups(accountId, request);
  const unavailableGroup =
    groupField.value !== "" &&
    (groups.isError ||
      !groups.data?.some((group) => group.id === groupField.value));

  useEffect(() => {
    if (
      groupField.value === unconfirmedGroup &&
      !groups.isError &&
      groups.data?.some((group) => group.id === groupId)
    ) {
      setValue("groupId", groupId, { shouldValidate: true });
    }
  }, [groupId, groupField.value, groups.data, groups.isError, setValue]);

  return (
    <form
      noValidate
      className="mb-7 text-copy"
      onSubmit={handleSubmit((values) => {
        if (create.isPending) return;
        if (
          values.groupId &&
          (groups.isError ||
            !groups.data?.some((group) => group.id === values.groupId))
        ) {
          setError("groupId", {
            type: "validate",
            message:
              "모임을 다시 확인하거나 ‘모임 없이 개인 행사’를 선택해 주세요.",
          });
          return;
        }
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
            if (onCreated) onCreated(event);
            else
              router.push(
                findVenue
                  ? `/restaurants?event=${event.id}&inquiry=1`
                  : `/events?event=${encodeURIComponent(event.id)}`,
              );
          },
        });
      })}
    >
      <h2 className="mb-7 text-2xl leading-tight font-bold">
        어떤 행사를 준비하나요?
      </h2>
      <div className="space-y-4 rounded-control bg-surface px-[22px] py-7 text-xs shadow-card">
        <div className="space-y-3">
          <label htmlFor={`${id}-group`}>모임 (선택)</label>
          <Select
            id={`${id}-group`}
            {...groupField}
            disabled={create.isPending}
            aria-invalid={!!errors.groupId}
            aria-describedby={errors.groupId ? `${id}-group-error` : undefined}
          >
            {unavailableGroup && (
              <option value={groupField.value} disabled>
                {!groups.data && !groups.isError
                  ? "모임 확인 중…"
                  : "모임을 다시 선택해 주세요."}
              </option>
            )}
            <option value="">모임 없이 개인 행사</option>
            {!groups.isError &&
              groups.data?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </Select>
          <FormError
            id={`${id}-group-error`}
            message={errors.groupId?.message}
          />
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
        <div className="space-y-3">
          <label htmlFor={`${id}-name`}>행사 이름</label>
          <Input
            variant="form"
            id={`${id}-name`}
            {...register("name")}
            required
            placeholder="1차 정기 모임"
            maxLength={100}
            disabled={create.isPending}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
          <FormError id={`${id}-name-error`} message={errors.name?.message} />
        </div>
        <div className="space-y-3">
          <label htmlFor={`${id}-date`}>일정 (선택 · 한국 시간)</label>
          <Input
            variant="form"
            id={`${id}-date`}
            type="datetime-local"
            {...register("date")}
            disabled={create.isPending}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? `${id}-date-error` : undefined}
          />
          <FormError id={`${id}-date-error`} message={errors.date?.message} />
        </div>
        {!onCreated && (
          <fieldset className="pt-3">
            <legend className="mb-5 text-sm font-semibold">
              장소도 함께 알아볼까요?
            </legend>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: true, label: "예약이 필요해요" },
                { value: false, label: "행사만 만들게요" },
              ].map((option) => (
                <label
                  key={String(option.value)}
                  className="flex min-h-20 cursor-pointer items-center justify-between gap-2 rounded-control border border-transparent bg-soft px-3 py-5 has-checked:border-brand has-checked:bg-choice has-focus-visible:outline-2 has-focus-visible:outline-brand"
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="findVenue"
                    checked={findVenue === option.value}
                    onChange={() => setFindVenue(option.value)}
                    disabled={create.isPending}
                  />
                  <span>{option.label}</span>
                  <Image
                    src={
                      findVenue === option.value
                        ? "/images/restaurants/radio-on.svg"
                        : "/images/restaurants/radio-off.svg"
                    }
                    alt=""
                    width={26}
                    height={26}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end pt-3">
          <Button
            className="min-h-[50px] px-5 text-sm"
            type="submit"
            disabled={create.isPending}
            aria-busy={create.isPending}
          >
            {create.isPending ? "저장 중…" : "행사 만들기"}
          </Button>
        </div>
        <FormError message={errors.root?.server?.message} />
      </div>
    </form>
  );
}
