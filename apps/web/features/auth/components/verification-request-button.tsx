import type { ComponentProps } from "react";
import { Button } from "@/shared/ui/button";

export function VerificationRequestButton(
  props: Omit<ComponentProps<typeof Button>, "className">,
) {
  return (
    <Button
      {...props}
      className="h-input shrink-0 rounded-control px-3 text-caption whitespace-nowrap shadow-control"
    />
  );
}
