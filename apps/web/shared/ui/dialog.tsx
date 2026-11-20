"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/cn";
import Image from "next/image";
import { IconButton } from "./icon-button";

const scrollLocks = new WeakMap<
  HTMLElement,
  { tokens: Set<symbol>; overflow: string; priority: string }
>();

function lockScroll(body: HTMLElement) {
  let lock = scrollLocks.get(body);
  if (!lock) {
    lock = {
      tokens: new Set(),
      overflow: body.style.getPropertyValue("overflow"),
      priority: body.style.getPropertyPriority("overflow"),
    };
    scrollLocks.set(body, lock);
  }
  const token = Symbol();
  lock.tokens.add(token);
  body.style.setProperty("overflow", "hidden");
  return () => {
    if (!lock.tokens.delete(token) || lock.tokens.size) return;
    if (lock.overflow)
      body.style.setProperty("overflow", lock.overflow, lock.priority);
    else body.style.removeProperty("overflow");
    scrollLocks.delete(body);
  };
}

// showModal supplies the top layer, background inertness and native Tab containment.
export function Dialog({
  children,
  labelledBy,
  describedBy,
  initialFocusRef,
  busy = false,
  showCloseButton = false,
  dismissOnBackdrop = false,
  onClose,
  className,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  busy?: boolean;
  showCloseButton?: boolean;
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const unlockScroll = lockScroll(document.body);
    initialFocusRef?.current?.focus();
    return () => {
      dialog.close();
      unlockScroll();
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
      onClick={(event) => {
        if (!dismissOnBackdrop || busy || event.target !== event.currentTarget)
          return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
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
            <Image src="/images/ui/close.svg" alt="" width={15} height={15} />
          </IconButton>
        </div>
      )}
      {children}
    </dialog>
  );
}
