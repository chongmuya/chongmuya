import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

type Props = { "aria-label": string } & (
  | (ComponentProps<typeof Link> & { href: string })
  | (ComponentProps<"button"> & { href?: never })
);

export function IconButton(props: Props) {
  const className = cn(
    "inline-flex size-control shrink-0 items-center justify-center rounded-pill transition-colors hover:bg-brand-ink/5 disabled:cursor-not-allowed disabled:opacity-60",
    props.className,
  );
  if (props.href !== undefined)
    return <Link {...props} className={className} />;
  return <button type="button" {...props} className={className} />;
}
