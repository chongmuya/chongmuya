"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import { groupSchema, type GroupInput } from "../schemas/group.schema";
import { useSaveGroup } from "../hooks/use-save-group";
import type { Group } from "../types/group.types";
import { GROUP_TYPES } from "../types/group-type";

export function GroupForm({
  accountId,
  request,
  group,
  title,
}: {
  accountId: string;
  request: SessionRequest;
  group: Group;
  title: string;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<GroupInput>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: group.name, groupType: group.groupType ?? "" },
  });
  const save = useSaveGroup(accountId, request, group.id, (saved) => {
    reset({ name: saved.name, groupType: saved.groupType ?? "" });
  });
  return (
    <form
      noValidate
      className="space-y-5 rounded-card bg-surface p-5 shadow-card"
      onSubmit={handleSubmit((values) => {
        if (save.isPending) return;
        clearErrors();
        save.mutate(values, {
          onError: (error) =>
            applyFormError(error, setError, {
              name: "name",
              groupType: "groupType",
            }),
        });
      })}
    >
      <div className="space-y-1">
        <label htmlFor={id}>모임 이름</label>
        <Input
          id={id}
          {...register("name")}
          required
          maxLength={100}
          disabled={save.isPending}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${id}-error` : undefined}
        />
        <FormError id={`${id}-error`} message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-type`}>모임 유형</label>
        <select
          id={`${id}-type`}
          {...register("groupType")}
          disabled={save.isPending}
          aria-invalid={!!errors.groupType}
          aria-describedby={errors.groupType ? `${id}-type-error` : undefined}
          className="min-h-12 w-full rounded-pill border border-field bg-surface px-4"
        >
          <option value="">미지정</option>
          {GROUP_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <FormError
          id={`${id}-type-error`}
          message={errors.groupType?.message}
        />
      </div>
      <Button
        type="submit"
        disabled={save.isPending}
        aria-busy={save.isPending}
      >
        {save.isPending ? "저장 중…" : title}
      </Button>
      <FormError message={errors.root?.server?.message} />
      {save.isSuccess && <p role="status">저장했습니다.</p>}
    </form>
  );
}
