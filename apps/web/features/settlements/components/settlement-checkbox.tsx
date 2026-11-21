import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import { Checkbox } from "@/shared/ui/checkbox";

export function SettlementCheckbox({
  className,
  ...props
}: ComponentProps<typeof Checkbox>) {
  return (
    <Checkbox
      {...props}
      className={cn(
        "checked:border-transparent checked:bg-transparent checked:bg-[url('/images/settlements/check-on.svg')] checked:bg-center checked:bg-no-repeat checked:shadow-none",
        className,
      )}
    />
  );
}
