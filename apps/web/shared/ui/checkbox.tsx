import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Checkbox({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      {...props}
      type="checkbox"
      className={cn(
        "size-6 shrink-0 appearance-none rounded-pill border border-placeholder cursor-pointer checked:border-brand checked:bg-brand checked:shadow-[inset_0_0_0_5px_var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
