"use client";
import { useId } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SessionRequest } from "@/features/auth/types";
import { useGroups } from "@/features/groups/client";
import { applyFormError } from "@/shared/lib/apply-form-error";
import { ApiError } from "@/shared/http/api-error";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { FormError } from "@/shared/ui/form-error";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { linkGroupSchema } from "../schemas/event.schema";
import { useLinkEventGroup } from "../hooks/use-link-event-group";
import type { Event } from "../types/event.types";

export function LinkEventGroupForm({
  accountId,
  event,
  request,
  refresh,
}: {
  accountId: string;
  event: Event;
  request: SessionRequest;
  refresh: () => void;
}) {
  const id = useId();
  const groups = useGroups(accountId, request);
  const link = useLinkEventGroup(accountId, event.id, request);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<{ groupId: string }>({
    resolver: zodResolver(linkGroupSchema),
    defaultValues: { groupId: "" },
  });
  if (groups.isError)
    return (
      <ErrorState retry={() => void groups.refetch()}>
        연결할 모임을 불러오지 못했습니다.
      </ErrorState>
    );
  if (!groups.data) return <LoadingState>모임 확인 중…</LoadingState>;
  if (!groups.data.length)
    return (
      <p>
        아직 모임이 없습니다. 개인 행사로 이용하거나{" "}
        <Link href="/mypage">모임을 만든 뒤 연결</Link>할 수 있습니다.
      </p>
    );
  return (
    <form
      noValidate
      className="form-panel"
      onSubmit={handleSubmit((values) => {
        if (link.isPending) return;
        clearErrors();
        link.mutate(
          { ...values, expectedVersion: event.version },
          {
            onError: (error) =>
              applyFormError(error, setError, { groupId: "groupId" }),
          },
        );
      })}
    >
      <h3>내 모임에 연결</h3>
      <p>
        행사 소유자와 기존 기록은 유지됩니다. 연결 해제나 다른 모임으로 이동하는
        기능은 제공하지 않습니다.
      </p>
      <label htmlFor={id}>연결할 모임</label>
      <Select
        id={id}
        {...register("groupId")}
        disabled={link.isPending}
        aria-invalid={!!errors.groupId}
        aria-describedby={errors.groupId ? `${id}-error` : undefined}
      >
        <option value="">모임 선택</option>
        {groups.data.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </Select>
      <FormError id={`${id}-error`} message={errors.groupId?.message} />
      <Button
        type="submit"
        disabled={link.isPending}
        aria-busy={link.isPending}
      >
        {link.isPending ? "연결 중…" : "모임에 연결"}
      </Button>
      <FormError message={errors.root?.server?.message} />
      {link.error instanceof ApiError &&
        ["VERSION_CONFLICT", "EVENT_ALREADY_LINKED"].includes(
          link.error.code,
        ) && <Button onClick={refresh}>최신 행사 확인</Button>}
    </form>
  );
}
