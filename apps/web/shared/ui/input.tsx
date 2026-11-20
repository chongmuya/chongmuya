import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Input({
  className,
  variant = "default",
  ...props
}: ComponentProps<"input"> & { variant?: "default" | "pill" | "form" }) {
  return (
    <input
      className={cn(
        "block min-h-input w-full border border-input bg-surface px-3 py-2 text-control text-foreground disabled:cursor-not-allowed disabled:opacity-60",
        variant === "pill"
          ? "rounded-pill border-transparent px-4 placeholder:text-placeholder"
          : "rounded-control placeholder:text-muted",
        variant === "form" &&
          "rounded-pill border-field px-3 text-copy placeholder:text-placeholder",
        className,
      )}
      {...props}
    />
  );
}
