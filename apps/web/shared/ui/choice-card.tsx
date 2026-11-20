import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

// Native radio semantics keep keyboard navigation and form integration together.
export function ChoiceCard({
  children,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type" | "children"> & {
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col rounded-card border-2 border-transparent bg-surface p-4 shadow-card transition-colors has-aria-invalid:border-danger not-has-aria-invalid:has-checked:border-brand not-has-aria-invalid:has-checked:bg-brand/5 has-focus-visible:focus-outline has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className,
      )}
    >
      <input {...input} type="radio" className="choice-card-radio" />
      {children}
    </label>
  );
}
