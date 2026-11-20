"use client";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import Image from "next/image";
import { useId, type ComponentProps, type ReactNode } from "react";
import { IconButton } from "@/shared/ui/icon-button";
import { FormField } from "@/shared/ui/form-field";
import { FormError } from "@/shared/ui/form-error";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";
import type { RegistrationData } from "../schemas/registration.schema";
export function OwnerField({
  path,
  label,
  required,
  hint,
  numeric = false,
  inputMode,
  disabled,
  placeholder,
  hideLabel = false,
  changed,
  onEnter,
}: {
  path: FieldPath<RegistrationData>;
  label: string;
  required?: boolean;
  hint?: string;
  numeric?: boolean;
  inputMode?: ComponentProps<typeof Input>["inputMode"];
  disabled?: boolean;
  placeholder?: string;
  hideLabel?: boolean;
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
          required={required}
          hint={hint}
          className="gap-2 [&>p]:text-xs"
          labelClassName={hideLabel ? "sr-only" : "text-label text-copy/80"}
          error={fieldState.error?.message}
        >
          {(attributes) => (
            <div className="relative">
              <Input
                variant="pill"
                className={cn(
                  "shadow-control",
                  onEnter && "pr-14",
                  numeric &&
                    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
                )}
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
                inputMode={numeric ? "numeric" : inputMode}
                disabled={disabled}
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
              {onEnter && (
                <IconButton
                  aria-label="주소 검색"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={onEnter}
                >
                  <Image
                    src="/images/groups/search.svg"
                    width={20}
                    height={20}
                    alt=""
                  />
                </IconButton>
              )}
            </div>
          )}
        </FormField>
      )}
    />
  );
}
export function OwnerChoice({
  path,
  label,
  required,
  options,
  changed,
  inline = false,
  compactUnknown = false,
  legendClassName,
}: {
  path: FieldPath<RegistrationData>;
  label: string;
  required?: boolean;
  options: readonly (readonly [string, string])[];
  changed?: (value: string) => void;
  inline?: boolean;
  compactUnknown?: boolean;
  legendClassName?: string;
}) {
  const id = useId();
  const { control } = useFormContext<RegistrationData>();
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <fieldset
          className="text-control"
          aria-invalid={!!fieldState.error}
          aria-describedby={fieldState.error ? id : undefined}
        >
          <legend
            className={cn("mb-3 text-label text-copy/80", legendClassName)}
          >
            {label}
            {required && (
              <span aria-hidden="true" className="text-brand">
                *
              </span>
            )}
          </legend>
          <div className="flex items-end justify-between gap-2">
            <div
              className={cn(
                "min-w-0",
                inline ? "flex flex-wrap gap-x-9 gap-y-2" : "grid gap-2",
              )}
            >
              {options
                .filter(([key]) => !compactUnknown || key !== "UNKNOWN")
                .map(([key, text], index) => (
                  <OwnerRadio
                    key={key}
                    onBlur={field.onBlur}
                    ref={index === 0 ? field.ref : undefined}
                    name={field.name}
                    value={key}
                    required={required}
                    checked={field.value === key}
                    onChange={() => {
                      field.onChange(key);
                      changed?.(key);
                    }}
                  >
                    {text}
                  </OwnerRadio>
                ))}
            </div>
            {compactUnknown && field.value !== "UNKNOWN" && (
              <OwnerUnknownButton
                label={label}
                onClick={() => {
                  field.onChange("UNKNOWN");
                  changed?.("UNKNOWN");
                }}
              />
            )}
          </div>
          <FormError id={id} message={fieldState.error?.message} />
        </fieldset>
      )}
    />
  );
}

export function OwnerUnknownButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} 미확인으로 두기`}
      className="min-h-6 shrink-0 cursor-pointer rounded-sm text-xs text-muted underline underline-offset-2"
      onClick={onClick}
    >
      미확인으로 두기
    </button>
  );
}

export function OwnerCheck({
  children,
  tick = false,
  ...props
}: ComponentProps<typeof Checkbox> & { children: ReactNode; tick?: boolean }) {
  return (
    <label
      className={cn(
        "flex items-center gap-2",
        tick ? "text-control" : "text-sm",
      )}
    >
      {tick ? (
        <span className="relative size-6 shrink-0">
          <Checkbox
            {...props}
            className={cn("peer checked:shadow-none", props.className)}
          />
          <OwnerTick className="hidden peer-checked:block" />
        </span>
      ) : (
        <Checkbox {...props} />
      )}
      {children}
    </label>
  );
}

export function OwnerRadio({
  children,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { children: ReactNode }) {
  return (
    <label className="flex min-h-6 cursor-pointer items-center gap-2">
      <span className="relative size-6 shrink-0">
        <input
          {...props}
          type="radio"
          className="peer size-6 cursor-pointer appearance-none rounded-full border border-placeholder checked:border-brand checked:bg-brand"
        />
        <OwnerTick className="hidden peer-checked:block" />
      </span>
      {children}
    </label>
  );
}

export function OwnerTick({ className }: { className?: string }) {
  return (
    <Image
      src="/images/merchant-replies/available-check.svg"
      width={24}
      height={24}
      alt=""
      className={cn("pointer-events-none absolute inset-0", className)}
    />
  );
}
