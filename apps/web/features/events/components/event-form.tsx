"use client";

import { isDateOnly } from "@/shared/lib/korean-date";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { useGroups } from "@/features/groups/client";
import { ErrorState } from "@/shared/ui/states";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { FormInput } from "@/shared/ui/form-input";
import Image from "next/image";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import {
  eventSchema,
  eventInput,
  type EventFormValues,
} from "../schemas/event.schema";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { useCreateEvent } from "../hooks/use-create-event";
import { eventKeys } from "../api/events.queries";

export function EventForm({
  accountId,
  groupId = "",
  initialDate,
  request,
  onCreated,
}: {
  accountId: string;
  groupId?: string;
  initialDate?: string;
  request: SessionRequest;
  onCreated?: (event: { id: string }) => void;
}) {
  const active = useActiveScreen();
  const id = useId();
  const router = useRouter();
  const cache = useQueryClient();
  const [importRoster, setImportRoster] = useState(true);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      date: isDateOnly(initialDate) ? initialDate : "",
      time: "",
      findVenue: !!onCreated,
      expectedGuests: "",
    },
  });
  const findVenue = useWatch({ control, name: "findVenue" });
  const create = useCreateEvent(accountId, request);
  const groups = useGroups(accountId, request);
  const group = groups.data?.find((group) => group.id === groupId);
  const unavailableGroup = !!groupId && (groups.isError || !group);

  return (
    <form
      noValidate
      className="mb-7 text-copy"
      onSubmit={handleSubmit((values) => {
        if (create.isPending) return;
        if (unavailableGroup) {
          setError("root.server", {
            type: "validate",
            message: "모임을 확인한 뒤 다시 시도해 주세요.",
          });
          return;
        }
        clearErrors();
        create.mutate(
          {
            ...eventInput(values, groupId || undefined),
            ...(groupId && group?.memberCount && importRoster
              ? { importGroupRoster: true }
              : {}),
          },
          {
            onError: (error) => {
              if (active.current)
                applyFormError(error, setError, {
                  name: "name",
                  scheduledAt: "date",
                });
            },
            onSuccess: (event) => {
              if (!active.current) return;
              if (values.findVenue && values.expectedGuests)
                cache.setQueryData(
                  eventKeys.guestEstimate(accountId, event.id),
                  values.expectedGuests,
                );
              reset();
              if (onCreated) onCreated(event);
              else
                router.push(
                  values.findVenue
                    ? `/restaurants?event=${event.id}&inquiry=1`
                    : `/events?event=${encodeURIComponent(event.id)}`,
                );
            },
          },
        );
      })}
    >
      <h2 className="mb-7 text-2xl leading-[29px] font-bold">
        어떤 행사를 준비하나요?
      </h2>
      <div className="flex flex-col gap-7 rounded-control bg-surface px-[22px] py-7 text-xs leading-[14px] shadow-card">
        <div className="flex flex-col gap-4">
          {groupId ? (
            <div className="flex flex-col gap-3">
              <p>모임</p>
              {group && (
                <p className="flex min-h-input items-center rounded-pill border border-field bg-soft px-3 text-sm text-secondary">
                  {group.name}
                </p>
              )}
              {groups.isError ? (
                <ErrorState retry={() => void groups.refetch()} />
              ) : !groups.data ? (
                <p role="status">모임 확인 중…</p>
              ) : !group ? (
                <p role="alert">
                  접근할 수 없는 모임이에요. 홈에서 모임을 확인해 주세요.
                </p>
              ) : null}
            </div>
          ) : null}
          <FormField
            id={`${id}-name`}
            label="행사 이름"
            error={errors.name?.message}
            className="gap-3"
          >
            {(attrs) => (
              <Input
                {...attrs}
                {...register("name")}
                variant="form"
                required
                placeholder="1차 정기 모임"
                maxLength={100}
                disabled={create.isPending}
              />
            )}
          </FormField>
          <fieldset className="min-w-0">
            <legend className="sr-only">일정 (한국 시간)</legend>
            <div className="grid grid-cols-2 gap-3.5">
              {(["date", "time"] as const).map((field) => (
                <FormField
                  key={field}
                  id={`${id}-${field}`}
                  label={
                    field === "date" && !findVenue
                      ? "날짜 (선택)"
                      : field === "date"
                        ? "날짜"
                        : "시간 (한국 시간)"
                  }
                  required={findVenue}
                  error={errors[field]?.message}
                  className="min-w-0 gap-[9px]"
                >
                  {(attrs) => (
                    <FormInput
                      {...attrs}
                      className="min-h-[49px] min-w-0"
                      variant="form"
                      type={field}
                      allowDateClear={!findVenue}
                      control={control}
                      name={field}
                      disabled={create.isPending}
                    />
                  )}
                </FormField>
              ))}
            </div>
          </fieldset>
          {findVenue && (
            <FormField
              id={`${id}-expected-guests`}
              label="예상 인원"
              hint="정확한 참석 명단은 나중에 정해도 괜찮아요."
              hintClassName="mt-1"
              error={errors.expectedGuests?.message}
              className="gap-3"
            >
              {(attrs) => (
                <Input
                  {...attrs}
                  {...register("expectedGuests")}
                  variant="form"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="예) 17"
                  disabled={create.isPending}
                />
              )}
            </FormField>
          )}
          {group && group.memberCount > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={importRoster}
                disabled={create.isPending}
                onChange={(e) => setImportRoster(e.target.checked)}
              />
              모임 기본 명단 불러오기 ({group.memberCount}명)
            </label>
          )}
        </div>
        {!onCreated && (
          <fieldset className="min-w-0">
            <legend className="mb-5 text-sm leading-[17px] font-semibold">
              장소도 함께 알아볼까요?
            </legend>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: true, label: "예약이 필요해요" },
                { value: false, label: "참석 · 정산만 할게요" },
              ].map((option) => (
                <label
                  key={String(option.value)}
                  className="relative flex min-h-20 cursor-pointer items-center justify-between gap-2 rounded-control border border-transparent bg-soft px-3 py-5 has-checked:border-brand has-checked:bg-choice has-focus-visible:focus-outline"
                >
                  <input
                    className="choice-card-radio"
                    type="radio"
                    name="findVenue"
                    checked={findVenue === option.value}
                    onChange={() => {
                      setValue("findVenue", option.value);
                      if (!option.value) {
                        setValue("expectedGuests", "");
                        clearErrors(["expectedGuests", "date", "time"]);
                      }
                    }}
                    disabled={create.isPending}
                  />
                  <span className="break-keep">{option.label}</span>
                  <Image
                    src={
                      findVenue === option.value
                        ? "/images/restaurants/radio-on.svg"
                        : "/images/restaurants/radio-off.svg"
                    }
                    alt=""
                    width={26}
                    height={26}
                    className="shrink-0"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid justify-items-end">
          <Button
            className="min-h-[50px] px-5 text-sm"
            type="submit"
            disabled={create.isPending || unavailableGroup}
            aria-busy={create.isPending}
          >
            {create.isPending ? "저장 중…" : "행사 만들기"}
            {!create.isPending && <span aria-hidden="true">→</span>}
          </Button>
          <FormError
            className="mt-4 justify-self-start"
            message={errors.root?.server?.message}
          />
        </div>
      </div>
    </form>
  );
}
