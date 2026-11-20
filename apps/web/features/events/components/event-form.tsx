"use client";

import { isDateOnly } from "@/shared/lib/korean-date";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
  const [importRoster, setImportRoster] = useState(true);
  const [findVenue, setFindVenue] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      date: isDateOnly(initialDate) ? initialDate : "",
      time: "",
    },
  });
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
              reset();
              if (onCreated) onCreated(event);
              else
                router.push(
                  findVenue
                    ? `/restaurants?event=${event.id}&inquiry=1`
                    : `/events?event=${encodeURIComponent(event.id)}`,
                );
            },
          },
        );
      })}
    >
      <h2 className="mb-7 text-2xl leading-tight font-bold">
        어떤 행사를 준비하나요?
      </h2>
      <div className="space-y-4 rounded-control bg-surface px-[22px] py-7 text-xs shadow-card">
        {groupId ? (
          <div className="space-y-3">
            <p>모임</p>
            {group && <p className="text-base font-medium">{group.name}</p>}
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
        <fieldset>
          <legend className="sr-only">일정 (선택 · 한국 시간)</legend>
          <div className="grid grid-cols-2 gap-3">
            {(["date", "time"] as const).map((field) => (
              <FormField
                key={field}
                id={`${id}-${field}`}
                label={field === "date" ? "날짜 (선택)" : "시간 (한국 시간)"}
                error={errors[field]?.message}
                className="min-w-0 gap-3"
              >
                {(attrs) => (
                  <FormInput
                    {...attrs}
                    className="min-w-0"
                    variant="form"
                    type={field}
                    control={control}
                    name={field}
                    disabled={create.isPending}
                  />
                )}
              </FormField>
            ))}
          </div>
        </fieldset>
        {group && group.memberCount > 0 && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={importRoster}
              disabled={create.isPending}
              onChange={(e) => setImportRoster(e.target.checked)}
            />
            모임 기본 명단 불러오기 ({group.memberCount}명)
          </label>
        )}
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
                  className="relative flex min-h-20 cursor-pointer items-center justify-between gap-2 rounded-control border border-transparent bg-soft px-3 py-5 has-checked:border-brand has-checked:bg-choice has-focus-visible:focus-outline"
                >
                  <input
                    className="choice-card-radio"
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
            disabled={create.isPending || unavailableGroup}
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
