"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/cn";
import Image from "next/image";
import { IconButton } from "./icon-button";

// showModal supplies the top layer, background inertness and native Tab containment.
export function Dialog({
  children,
  labelledBy,
  describedBy,
  initialFocusRef,
  busy = false,
  showCloseButton = false,
  onClose,
  className,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  busy?: boolean;
  showCloseButton?: boolean;
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
      {showCloseButton && (
        <div className="relative h-3.5">
          <IconButton
            aria-label="닫기"
            className="absolute -top-3 -left-3"
            disabled={busy}
            onClick={onClose}
          >
            <Image
              src="/images/ui/close.svg"
              alt=""
              width={14.7749}
              height={14.9156}
            />
          </IconButton>
        </div>
      )}
      {children}
    </dialog>
  );
}
