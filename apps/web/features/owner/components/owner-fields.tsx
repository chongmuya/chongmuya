"use client";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import type { ComponentProps, ReactNode } from "react";
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
  const { control } = useFormContext<RegistrationData>();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <label className="block space-y-2 text-control">
          <span className="block font-semibold">{label}</span>
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
              typeof field.value === "number" || typeof field.value === "string"
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
            aria-invalid={!!fieldState.error}
          />
          {fieldState.error && (
            <span role="alert" className="text-sm text-danger">
              {fieldState.error.message ?? "입력값을 확인해 주세요."}
            </span>
          )}
        </label>
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
  const { control } = useFormContext<RegistrationData>();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field }) => (
        <fieldset className="space-y-3 text-control">
          <legend className="mb-3 font-semibold">{label}</legend>
          {options.map(([key, text]) => (
            <label className="flex min-h-8 items-center gap-3" key={key}>
              <input
                className="size-6 accent-brand"
                type="radio"
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
