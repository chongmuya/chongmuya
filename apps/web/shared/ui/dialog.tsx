"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/cn";

// showModal supplies the top layer, background inertness and native Tab containment.
export function Dialog({
  children,
  labelledBy,
  describedBy,
  initialFocusRef,
  busy = false,
  onClose,
  className,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  busy?: boolean;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    initialFocusRef?.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      className={cn(
        "m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-control border-0 bg-surface p-5 text-foreground shadow-card backdrop:bg-black/40",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
