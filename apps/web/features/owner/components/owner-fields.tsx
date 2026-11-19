"use client";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import { useId, type ComponentProps, type ReactNode } from "react";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import type { RegistrationData } from "../schemas/registration.schema";
export function OwnerField({
  path,
  label,
  numeric = false,
  placeholder,
  changed,
  onEnter,
}: {
  path: FieldPath<RegistrationData>;
  label: string;
  numeric?: boolean;
  placeholder?: string;
  changed?: () => void;
  onEnter?: () => void;
}) {
  const id = useId();
  const { control } = useFormContext<RegistrationData>();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <FormField
          id={id}
          label={label}
          labelClassName="font-semibold text-control"
          error={fieldState.error?.message}
        >
          {(attributes) => (
            <Input
              variant="pill"
              className="shadow-control"
              onKeyDown={(e) => {
                if (e.key === "Enter" && onEnter) {
                  e.preventDefault();
                  onEnter();
                }
              }}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={
                typeof field.value === "number" ||
                typeof field.value === "string"
                  ? field.value
                  : ""
              }
              type={numeric ? "number" : "text"}
              min={numeric ? 0 : undefined}
              inputMode={numeric ? "numeric" : undefined}
              placeholder={placeholder ?? (numeric ? "미확인" : undefined)}
              onChange={(e) => {
                field.onChange(
                  numeric
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value,
                );
                changed?.();
              }}
              {...attributes}
            />
          )}
        </FormField>
      )}
    />
  );
}
export function OwnerChoice({
  path,
  label,
  options,
  changed,
}: {
  path: FieldPath<RegistrationData>;
  label: string;
  options: readonly (readonly [string, string])[];
  changed?: (value: string) => void;
}) {
  const id = useId();
  const { control } = useFormContext<RegistrationData>();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <fieldset
          className="space-y-3 text-control"
          aria-invalid={!!fieldState.error}
          aria-describedby={fieldState.error ? id : undefined}
        >
          <legend className="mb-3 font-semibold">{label}</legend>
          {options.map(([key, text], index) => (
            <label className="flex min-h-8 items-center gap-3" key={key}>
              <input
                className="size-6 accent-brand"
                type="radio"
                onBlur={field.onBlur}
                ref={index === 0 ? field.ref : undefined}
                name={field.name}
                value={key}
                checked={field.value === key}
                onChange={() => {
                  field.onChange(key);
                  changed?.(key);
                }}
              />
              <span>{text}</span>
            </label>
          ))}
          <FormError id={id} message={fieldState.error?.message} />
        </fieldset>
      )}
    />
  );
}

export function OwnerCheck({
  children,
  ...props
}: ComponentProps<typeof Checkbox> & { children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox {...props} />
      {children}
    </label>
  );
}
