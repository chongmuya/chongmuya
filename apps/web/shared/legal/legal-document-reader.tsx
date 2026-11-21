import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "../ui/button";
import { legalDocumentProse } from "./documents";

export function LegalDocumentReader({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <h1
        tabIndex={-1}
        className="focus:outline-none ml-[17px] text-2xl leading-[29px] font-bold text-brand-ink"
      >
        {title}
      </h1>
      <div
        role="region"
        aria-label={`${title} 본문`}
        tabIndex={0}
        className={cn(
          legalDocumentProse,
          "mt-6 mb-5 min-h-0 flex-1 overflow-y-auto overscroll-contain border border-placeholder p-2.5 text-base font-medium",
        )}
      >
        {children}
      </div>
      <Button
        className="w-full shrink-0 border-2 text-brand"
        variant="brand-outline"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </article>
  );
}
