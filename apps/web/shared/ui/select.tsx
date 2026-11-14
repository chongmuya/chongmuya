import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "mt-1 block w-full rounded-control border border-input bg-surface p-3 text-foreground aria-invalid:border-danger disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
