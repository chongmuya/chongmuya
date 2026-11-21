"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/cn";
import { Dialog } from "./dialog";
import { IconButton } from "./icon-button";

export function BottomSheet({
  title,
  children,
  footer,
  headerAction,
  returnFocusRef,
  onClose,
  busy = false,
  dateSelection = false,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
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
      returnFocusRef={returnFocusRef}
      dismissOnBackdrop={dateSelection}
      className={`mx-auto mt-auto mb-0 flex max-h-[85dvh] w-full max-w-[402px] flex-col overflow-hidden rounded-t-card rounded-b-none p-0 text-copy ${dateSelection ? "sm:my-auto sm:rounded-card" : ""}`}
    >
      <header
        className={cn(
          "shrink-0 px-5 pt-3",
          dateSelection ? "relative min-h-13" : "pb-4",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "mx-auto h-1 w-10 rounded-pill bg-border",
            !dateSelection && "mb-4",
          )}
        />
        <div className="flex items-center justify-between gap-3">
          <h2
            id={id}
            className={dateSelection ? "sr-only" : "text-lg font-semibold"}
          >
            {title}
          </h2>
          {headerAction}
          <IconButton
            aria-label="닫기"
            className={
              dateSelection
                ? "absolute top-1.5 right-3 text-secondary"
                : undefined
            }
            disabled={busy}
            onClick={onClose}
          >
            {dateSelection ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-5"
                fill="none"
              >
                <path
                  d="M4 4l12 12M16 4 4 16"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              "×"
            )}
          </IconButton>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-1 pb-5">
        {children}
      </div>
      <footer className="shrink-0 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        {footer}
      </footer>
    </Dialog>
  );
}
