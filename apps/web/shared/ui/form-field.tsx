import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { FormError } from "./form-error";

export function FormField({
  id,
  label,
  hint,
  error,
  children,
  className,
  labelClassName,
  errorClassName,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  labelClassName?: string;
  errorClassName?: string;
  children: (attributes: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": !!error,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      )}
      <FormError
        id={`${id}-error`}
        message={error}
        className={errorClassName}
      />
    </div>
  );
}
