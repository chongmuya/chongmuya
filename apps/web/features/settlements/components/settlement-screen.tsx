"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/cn";

export function SettlementScreen({
  children,
  titleId,
  onClose,
  busy,
  white = false,
}: {
  children: ReactNode;
  titleId: string;
  onClose: () => void;
  busy?: boolean;
  white?: boolean;
}) {
  return (
    <Dialog
      labelledBy={titleId}
      busy={busy}
      onClose={onClose}
      className={cn(
        "mx-auto my-0 h-dvh max-h-none w-full max-w-[402px] rounded-none p-0 text-copy shadow-none backdrop:bg-background",
        white ? "bg-surface" : "bg-background",
      )}
    >
      {children}
    </Dialog>
  );
}
