import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Button({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "min-h-11 rounded-control border border-primary bg-primary px-4 py-2 text-white disabled:cursor-wait disabled:opacity-60 enabled:cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}
