import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "block min-h-input w-full rounded-pill border border-field bg-surface px-3 py-3 text-control text-copy disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
