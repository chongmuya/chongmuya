"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { ApiError } from "@/shared/http/api-error";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormError } from "@/shared/ui/form-error";
import { groupSchema, type GroupInput } from "../schemas/group.schema";
import { useSaveGroup } from "../hooks/use-save-group";
import type { Group } from "../types/group.types";

export function GroupForm({
  accountId,
  request,
  group,
  title,
  onCreated,
}: {
  accountId: string;
  request: SessionRequest;
  group?: Group;
  title: string;
  onCreated?: (group: Group) => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GroupInput>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: group?.name ?? "" },
  });
  const save = useSaveGroup(accountId, request, group?.id, (saved) => {
    reset({ name: group ? saved.name : "" });
    if (!group) onCreated?.(saved);
  });
  return (
    <form
      noValidate
      className="form-panel"
      onSubmit={handleSubmit((values) => {
        if (save.isPending) return;
        save.mutate(values);
      })}
    >
      <h2>{title}</h2>
      <div>
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
      <Button
        type="submit"
        disabled={save.isPending}
        aria-busy={save.isPending}
      >
        {save.isPending ? "저장 중…" : title}
      </Button>
      <FormError
        message={
          save.isError
            ? save.error instanceof ApiError && save.error.status === 400
              ? "입력한 이름을 확인해 주세요."
              : "저장하지 못했습니다. 연결과 권한을 확인하고 다시 시도해 주세요."
            : undefined
        }
      />
      {save.isSuccess && <p role="status">저장했습니다.</p>}
    </form>
  );
}
