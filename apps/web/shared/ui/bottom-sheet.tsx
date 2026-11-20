"use client";

import { useId, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { IconButton } from "./icon-button";

export function BottomSheet({
  title,
  children,
  footer,
  onClose,
  busy = false,
  dateSelection = false,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  dateSelection?: boolean;
}) {
  const id = useId();
  return (
    <Dialog
      labelledBy={id}
      onClose={onClose}
      busy={busy}
      dismissOnBackdrop={dateSelection}
      className={`mx-auto mt-auto mb-0 flex max-h-[85dvh] w-full max-w-[402px] flex-col overflow-hidden rounded-t-card rounded-b-none p-0 text-copy ${dateSelection ? "sm:my-auto sm:rounded-card" : ""}`}
    >
      <header className="shrink-0 px-5 pt-3 pb-4">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 h-1 w-10 rounded-pill bg-border"
        />
        <div className="flex items-center justify-between gap-3">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton aria-label="닫기" disabled={busy} onClick={onClose}>
            ×
          </IconButton>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">
        {children}
      </div>
      <footer className="shrink-0 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        {footer}
      </footer>
    </Dialog>
  );
}
