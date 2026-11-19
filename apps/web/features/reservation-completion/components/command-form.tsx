"use client";
import { fromKoreanDateInput } from "@/shared/lib/korean-date";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { ApiError } from "@/shared/http/api-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { useCompletionCommand } from "../hooks/use-completion-command";
import { ReviewCurrent } from "./review-current";
export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "datetime-local" | "textarea" | "checkbox";
  value?: string;
  optional?: boolean;
  max?: number;
  options?: { value: string; label: string }[];
};
export { koreanDateInput as localDate } from "@/shared/lib/korean-date";
export const isoDate = (value: string) => {
  const result = fromKoreanDateInput(value);
  if (!result) throw new RangeError("INVALID_DATE");
  return result;
};
export function CommandForm({
  data,
  access,
  action,
  title,
  description,
  fields,
  build,
  onDone,
}: {
  data: Completion;
  access: CompletionAccess;
  action: string;
  title: string;
  description?: string;
  fields: Field[];
  build: (
    v: Record<string, string>,
    base: Completion,
  ) => Record<string, unknown>;
  onDone?: () => void;
}) {
  const [base, setBase] = useState(data),
    id = useId(),
    mutation = useCompletionCommand(data.id, access);
  const schema = z.object(
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        z.string().superRefine((v, c) => {
          if (!f.optional && !v.trim())
            c.addIssue({
              code: "custom",
              message: "이 항목을 입력하거나 확인해 주세요.",
            });
          if (f.max && v.length > f.max)
            c.addIssue({
              code: "custom",
              message: `${f.max}자 이내로 입력해 주세요.`,
            });
          if (
            f.type === "number" &&
            v &&
            (!Number.isSafeInteger(Number(v)) ||
              Number(v) < 0 ||
              Number(v) > 2_000_000_000)
          )
            c.addIssue({
              code: "custom",
              message: "0~20억 사이의 정수를 입력해 주세요.",
            });
          if (
            f.type === "datetime-local" &&
            v &&
            !Number.isFinite(Date.parse(v))
          )
            c.addIssue({
              code: "custom",
              message: "날짜와 시간을 확인해 주세요.",
            });
        }),
      ]),
    ),
  );
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      fields.map((f) => [f.name, f.value ?? ""]),
    ),
  });
  return (
    <form
      noValidate
      className="space-y-4 rounded-control bg-surface p-5 shadow-card"
      onSubmit={form.handleSubmit(async (v) => {
        if (base.version !== data.version) return;
        try {
          await mutation.mutateAsync({
            action,
            input: { ...build(v, base), expectedVersion: base.version },
          });
          if (mutation.active.current) onDone?.();
        } catch (error) {
          if (error instanceof ApiError && error.code === "VALIDATION_FAILED")
            for (const issue of error.fieldErrors ?? [])
              if (fields.some((f) => f.name === issue.field))
                form.setError(
                  issue.field,
                  { message: "입력 값과 안내 조건을 확인해 주세요." },
                  { shouldFocus: true },
                );

          if (!mutation.error && error instanceof RangeError)
            form.setError("root", { message: "날짜와 시간을 확인해 주세요." });
        }
      })}
    >
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="text-xs text-muted">{description}</p>}
      {fields.map((f) => (
        <FormField
          key={f.name}
          id={`${id}-${f.name}`}
          label={f.label}
          required={!f.optional}
          error={form.formState.errors[f.name]?.message}
        >
          {(attrs) =>
            f.options ? (
              <select
                {...attrs}
                {...form.register(f.name)}
                className="min-h-11 w-full rounded-control border border-field bg-surface px-3"
              >
                <option value="">선택해 주세요</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                {...attrs}
                {...form.register(f.name)}
                rows={3}
                maxLength={f.max}
                className="w-full rounded-control border border-field p-3"
              />
            ) : f.type === "checkbox" ? (
              <input
                {...attrs}
                type="checkbox"
                className="size-5"
                onChange={(e) =>
                  form.setValue(f.name, e.target.checked ? "yes" : "", {
                    shouldValidate: true,
                  })
                }
              />
            ) : (
              <Input
                {...attrs}
                type={f.type ?? "text"}
                {...form.register(f.name)}
              />
            )
          }
        </FormField>
      ))}
      <ReviewCurrent
        data={data}
        baseVersion={base.version}
        onReview={() => {
          setBase(data);
          mutation.reset();
        }}
      />
      <FormError
        message={
          form.formState.errors.root?.message ??
          (mutation.error ? safeErrorMessage(mutation.error) : undefined)
        }
      />
      <Button
        type="submit"
        className="w-full"
        disabled={base.version !== data.version}
        loading={mutation.isPending}
      >
        {title}
      </Button>
      {mutation.isSuccess && (
        <p role="status" className="text-sm">
          기록을 저장했어요.
        </p>
      )}
    </form>
  );
}
