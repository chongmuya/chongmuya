import { cn } from "../lib/cn";

export function FormError({
  id,
  message,
  className,
}: {
  id?: string;
  message?: string;
  className?: string;
}) {
  return message ? (
    <p
      id={id}
      role="alert"
      className={cn("mt-1 text-sm text-danger", className)}
    >
      {message}
    </p>
  ) : null;
}
