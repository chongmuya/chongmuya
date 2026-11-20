"use client";
import { useId, type ComponentProps } from "react";
import { cn } from "../lib/cn";
type Props = Omit<
  ComponentProps<"select">,
  "value" | "onChange" | "multiple"
> & {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  allowEndOfDay?: boolean;
};
export function TimePicker({
  value,
  onChange,
  readOnly,
  allowEndOfDay = false,
  className,
  id,
  ref,
  ...props
}: Props) {
  const generated = useId();
  const [hour = "", minute = ""] = value.split(":");
  const hasTime = hour !== "" || minute !== "";
  // Keep the native controls interactive while styling the displayed digits.
  const selectClass =
    "row-start-1 min-h-11 w-full min-w-0 cursor-pointer appearance-none opacity-0 focus:outline-none disabled:cursor-not-allowed";
  const digitsClass =
    "pointer-events-none row-start-1 text-control tabular-nums decoration-brand decoration-1 underline-offset-4";
  const set = (h: string, m: string) => onChange(!h && !m ? "" : `${h}:${m}`);
  return (
    <div
      className={cn(
        "time-picker grid min-h-input min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center rounded-pill border bg-surface px-2 shadow-control has-[select:focus]:border-brand",
        className,
      )}
      role="group"
      aria-label="시간 (24시간제)"
    >
      <select
        {...props}
        ref={ref}
        id={id ?? generated}
        aria-label={props["aria-label"] ? `${props["aria-label"]} 시` : "시"}
        disabled={props.disabled || readOnly}
        className={cn(selectClass, "peer/hour col-start-1")}
        value={hour}
        onChange={(e) =>
          set(e.target.value, e.target.value === "24" ? "00" : minute)
        }
      >
        <option value="" disabled hidden>
          선택 안 됨
        </option>
        {Array.from({ length: allowEndOfDay ? 25 : 24 }, (_, i) =>
          String(i).padStart(2, "0"),
        ).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className={cn(
          digitsClass,
          "col-start-1 mr-2 justify-self-end peer-focus-visible/hour:underline peer-disabled/hour:opacity-60",
          hour ? "peer-aria-invalid/hour:text-danger" : "text-placeholder",
        )}
      >
        {hour || "00"}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "col-start-2 row-start-1 text-control",
          !hasTime && "text-placeholder",
        )}
      >
        :
      </span>
      <select
        {...props}
        name={undefined}
        id={`${id ?? generated}-minute`}
        aria-label={props["aria-label"] ? `${props["aria-label"]} 분` : "분"}
        disabled={props.disabled || readOnly || hour === "24"}
        className={cn(selectClass, "peer/minute col-start-3")}
        value={minute}
        onChange={(e) => set(hour, e.target.value)}
      >
        <option value="" disabled hidden>
          선택 안 됨
        </option>
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
          (m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ),
        )}
      </select>
      <span
        aria-hidden="true"
        className={cn(
          digitsClass,
          "col-start-3 ml-2 justify-self-start peer-focus-visible/minute:underline peer-disabled/minute:opacity-60",
          minute ? "peer-aria-invalid/minute:text-danger" : "text-placeholder",
        )}
      >
        {minute || "00"}
      </span>
      {hasTime && (
        <button
          type="button"
          aria-label="시간 지우기"
          disabled={props.disabled || readOnly}
          className="col-start-4 row-start-1 min-h-11 min-w-7 rounded-pill text-secondary disabled:opacity-60"
          onClick={(event) => {
            event.currentTarget.parentElement?.querySelector("select")?.focus();
            onChange("");
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
