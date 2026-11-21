"use client";
import { useRef, useState, type ComponentProps } from "react";
import Image from "next/image";
import { cn } from "../lib/cn";
import { Calendar } from "./calendar";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
type Props = Omit<ComponentProps<"button">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  allowClear?: boolean;
  min?: string;
  max?: string;
  label?: string;
  formatValue?: (value: string) => string;
};
export function DatePicker({
  value,
  onChange,
  readOnly,
  allowClear = false,
  min,
  max,
  label = "날짜 선택",
  formatValue,
  className,
  ...props
}: Props) {
  const [editing, setEditing] = useState<{
    initial: string;
    draft: string;
  } | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  if (editing && (editing.initial !== value || props.disabled || readOnly))
    setEditing(null);
  const open =
    editing !== null &&
    editing.initial === value &&
    !props.disabled &&
    !readOnly;
  return (
    <>
      <button
        {...props}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={readOnly || props.disabled || undefined}
        className={cn(
          "flex min-h-input w-full items-center justify-between gap-2 rounded-pill border border-transparent bg-surface py-2 ps-3 pe-3.5 text-left text-sm min-[360px]:text-control shadow-control disabled:opacity-60",
          className,
        )}
        onClick={(event) => {
          if (!readOnly) {
            event.currentTarget.focus();
            setEditing({ initial: value, draft: value });
          }
        }}
      >
        <span className={cn("min-w-0 truncate", !value && "text-placeholder")}>
          {value ? (formatValue?.(value) ?? value) : "날짜 선택"}
        </span>
        <Image
          src="/images/select-arrow.svg"
          width={10}
          height={7}
          alt=""
          className="shrink-0"
        />
      </button>
      {open && (
        <BottomSheet
          dateSelection
          title={label}
          onClose={() => setEditing(null)}
          footer={
            <div className="flex items-center justify-between gap-2">
              {allowClear && value && editing.draft && (
                <button
                  type="button"
                  className="min-h-control cursor-pointer rounded-control px-2 text-sm text-secondary underline underline-offset-4"
                  onClick={() => {
                    setEditing({ initial: value, draft: "" });
                    confirm.current?.focus();
                  }}
                >
                  날짜 지우기
                </button>
              )}
              <Button
                ref={confirm}
                className="ml-auto min-w-20"
                disabled={!editing.draft && !(allowClear && value)}
                onClick={() => {
                  onChange(editing.draft);
                  setEditing(null);
                }}
              >
                확인
              </Button>
            </div>
          }
        >
          <Calendar
            value={editing.draft}
            onChange={(draft) => setEditing({ initial: value, draft })}
            min={min}
            max={max}
          />
        </BottomSheet>
      )}
    </>
  );
}
