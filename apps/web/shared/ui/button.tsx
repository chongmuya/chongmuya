import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

type Variant = "solid" | "outline" | "brand-outline" | "ink" | "kakao";
const variants: Record<Variant, string> = {
  solid:
    "border-brand-action bg-brand-action text-white [&:not(:disabled):hover]:bg-brand-hover",
  outline:
    "border-brand-ink bg-transparent text-brand-ink [&:not(:disabled):hover]:bg-brand-ink/5",
  "brand-outline":
    "border-brand bg-transparent text-brand-action [&:not(:disabled):hover]:bg-brand/5",
  ink: "border-brand-ink bg-brand-ink text-white [&:not(:disabled):hover]:bg-brand-ink-hover",
  kakao: "border-kakao bg-kakao text-black/80",
};

// Links and buttons share presentation; navigation stays a real link.
export function buttonStyles({
  variant = "solid",
  className,
}: { variant?: Variant; className?: string } = {}) {
  return cn(
    "inline-flex min-h-control items-center justify-center gap-1 rounded-pill border px-4 py-2 text-control font-semibold text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait enabled:cursor-pointer",
    variants[variant],
    className,
  );
}

export function Button({
  className,
  type = "button",
  variant,
  loading = false,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, className })}
      {...props}
    />
  );
}
