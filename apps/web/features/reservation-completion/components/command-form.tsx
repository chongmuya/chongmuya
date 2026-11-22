"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Field } from "../types/command-field";
import { commandSchema } from "../schemas/command.schema";
import { Checkbox } from "@/shared/ui/checkbox";
import { Button } from "@/shared/ui/button";
import { FormInput } from "@/shared/ui/form-input";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { ApiError } from "@/shared/http/api-error";
import { safeErrorMessage } from "@/shared/http/error-contract";
import type { Completion, CompletionAccess } from "../types/completion.types";
import { useCompletionCommand } from "../hooks/use-completion-command";
import { UncertainCommand } from "./uncertain-command";
import { ReviewCurrent } from "./review-current";
export function CommandForm({
  data,
  access,
  action,
  title,
  description,
  fields: fieldSource,
  build,
  onDone,
  available = true,
  validate,
  preview,
  fieldSummary,
  hideTitle = false,
  onCancel,
}: {
  data: Completion;
  access: CompletionAccess;
  action: string;
  title: string;
  description?: string;
  fields: Field[] | ((base: Completion) => Field[]);
  build: (
    v: Record<string, string>,
    base: Completion,
  ) => Record<string, unknown>;
  onDone?: (result: Completion, previous: Completion) => void;
  available?: boolean;
  validate?: (
    values: Record<string, string>,
  ) => { field: string; message: string }[];
  preview?: (values: Record<string, string>, base: Completion) => ReactNode;
  fieldSummary?: (
    base: Completion,
    values: Partial<Record<string, string>>,
  ) => { names: string[]; text: string } | undefined;
  hideTitle?: boolean;
  onCancel?: () => void;
}) {
  const [base, setBase] = useState(data),
    id = useId(),
    mutation = useCompletionCommand(data.id, access);
  const fieldsFor = (current: Completion) =>
    typeof fieldSource === "function" ? fieldSource(current) : fieldSource;
  const fields = fieldsFor(base);
  const schema = commandSchema(fields).superRefine((values, ctx) => {
    for (const issue of validate?.(values) ?? [])
      ctx.addIssue({
        code: "custom",
        path: [issue.field],
        message: issue.message,
      });
  });
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      fields.map((f) => [f.name, f.value ?? ""]),
    ),
  });
  const values = useWatch({ control: form.control });
  const summaryDisclosure = useRef<HTMLDetailsElement>(null);
  const accountChanged =
    action === "guidance" &&
    !base.guidance.account &&
    base.ownerDepositAccount?.revision !== data.ownerDepositAccount?.revision;
  const changed = base.version !== data.version || accountChanged;
  const completed = (result: Completion) => {
    if (!mutation.active.current) return;
    setBase(result);
    form.reset(
      Object.fromEntries(fieldsFor(result).map((f) => [f.name, f.value ?? ""])),
    );
    onDone?.(result, base);
  };
  const visibleFields = fields.filter((f) => f.when?.(values) !== false);
  const summary = fieldSummary?.(base, values);
  const revealSummaryField = (name: string) => {
    if (summary?.names.includes(name) && summaryDisclosure.current)
      summaryDisclosure.current.open = true;
  };
  const renderField = (f: Field) => (
    <FormField
      key={f.name}
      id={`${id}-${f.name}`}
      label={f.label}
      required={!f.optional}
      className={
        f.type === "checkbox"
          ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 [&>p]:col-span-2"
          : undefined
      }
      labelClassName={
        f.type === "checkbox"
          ? "col-start-2 row-start-1 py-2 text-sm"
          : undefined
      }
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
          <Checkbox
            {...attrs}
            checked={values[f.name] === "yes"}
            className="col-start-1 row-start-1"
            onChange={(e) =>
              form.setValue(f.name, e.target.checked ? "yes" : "", {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          />
        ) : (
          <FormInput
            {...attrs}
            type={f.type ?? "text"}
            allowDateClear={f.optional}
            control={form.control}
            name={f.name}
          />
        )
      }
    </FormField>
  );
  const dirty = form.formState.isDirty;
  if (!available && !dirty && !mutation.uncertain && !mutation.isPending)
    return null;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) =>
        void form.handleSubmit(
          async (v) => {
            if (
              !available ||
              mutation.uncertain ||
              mutation.isPending ||
              changed
            )
              return;
            try {
              const result = await mutation.mutateAsync({
                action,
                input: { ...build(v, base), expectedVersion: base.version },
              });
              completed(result);
            } catch (error) {
              if (
                error instanceof ApiError &&
                error.code === "VALIDATION_FAILED"
              )
                for (const issue of error.fieldErrors ?? [])
                  if (
                    fields.some(
                      (f) => f.name === issue.field && f.when?.(v) !== false,
                    )
                  ) {
                    revealSummaryField(issue.field);
                    form.setError(
                      issue.field,
                      { message: "입력 값과 안내 조건을 확인해 주세요." },
                      { shouldFocus: true },
                    );
                  }

              if (!mutation.error && error instanceof RangeError)
                form.setError("root", {
                  message: "날짜와 시간을 확인해 주세요.",
                });
            }
          },
          (errors) => {
            const hiddenError = summary?.names.find((name) => errors[name]);
            if (hiddenError) revealSummaryField(hiddenError);
          },
        )(event)
      }
    >
      {!hideTitle && <h3 className="font-semibold">{title}</h3>}
      {description && <p className="text-xs text-muted">{description}</p>}
      {!available && (
        <p role="alert">
          예약 상태가 바뀌어 이 작업을 저장할 수 없어요. 작성 내용은 보존했어요.
        </p>
      )}
      <fieldset
        disabled={!available || mutation.uncertain || mutation.isPending}
        className="space-y-4"
      >
        {summary && (
          <details ref={summaryDisclosure} className="space-y-4">
            <summary className="cursor-pointer rounded-control bg-soft p-3 text-sm font-medium">
              {summary.text} <span className="text-link">· 변경</span>
            </summary>
            {visibleFields
              .filter((f) => summary.names.includes(f.name))
              .map(renderField)}
          </details>
        )}
        {visibleFields
          .filter((f) => !summary?.names.includes(f.name))
          .map(renderField)}
        {available && !mutation.uncertain && (
          <ReviewCurrent
            data={data}
            baseVersion={base.version}
            accountChanged={accountChanged}
            compact={
              access.kind === "organizer" &&
              (action === "acknowledge" || action === "transfer")
            }
            onReview={() => {
              if (action === "receipt") {
                for (const field of fieldsFor(data).filter(
                  ({ name }) => name === "amount" || name === "receivedAt",
                )) {
                  if (!form.getFieldState(field.name, form.formState).isDirty)
                    form.resetField(field.name, {
                      defaultValue: field.value ?? "",
                    });
                }
              }
              setBase(data);
              mutation.reset();
            }}
          />
        )}
        {preview?.(
          Object.fromEntries(
            fields.map((field) => [field.name, values[field.name] ?? ""]),
          ),
          base,
        )}
        <FormError
          message={
            form.formState.errors.root?.message ??
            (mutation.error ? safeErrorMessage(mutation.error) : undefined)
          }
        />
        <div className={onCancel ? "grid grid-cols-2 gap-3.5" : undefined}>
          {onCancel && (
            <Button
              variant="brand-outline"
              className="border-2 text-brand"
              onClick={onCancel}
            >
              뒤로가기
            </Button>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={changed}
            loading={mutation.isPending}
          >
            {title}
          </Button>
        </div>
      </fieldset>
      {mutation.uncertain && (
        <UncertainCommand
          loading={mutation.isPending}
          onRetry={() => {
            void mutation
              .retryUncertain()
              .then(completed)
              .catch(() => undefined);
          }}
        />
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-sm">
          기록을 저장했어요.
        </p>
      )}
    </form>
  );
}
