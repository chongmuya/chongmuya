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
  const classes =
    "min-h-11 min-w-0 flex-1 appearance-none rounded-pill bg-transparent px-1 py-2 text-center text-control aria-invalid:text-danger disabled:opacity-60";
  const set = (h: string, m: string) => onChange(!h && !m ? "" : `${h}:${m}`);
  return (
    <div
      className={cn(
        "time-picker flex min-h-input min-w-0 items-center rounded-pill border bg-surface px-2 shadow-control",
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
        className={classes}
        value={hour}
        onChange={(e) =>
          set(e.target.value, e.target.value === "24" ? "00" : minute)
        }
      >
        <option value="">시</option>
        {Array.from({ length: allowEndOfDay ? 25 : 24 }, (_, i) =>
          String(i).padStart(2, "0"),
        ).map((h) => (
          <option key={h} value={h}>
            {h}시
          </option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        {...props}
        name={undefined}
        id={`${id ?? generated}-minute`}
        aria-label={props["aria-label"] ? `${props["aria-label"]} 분` : "분"}
        disabled={props.disabled || readOnly || hour === "24"}
        className={classes}
        value={minute}
        onChange={(e) => set(hour, e.target.value)}
      >
        <option value="">분</option>
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
          (m) => (
            <option key={m} value={m}>
              {m}분
            </option>
          ),
        )}
      </select>
      <button
        type="button"
        aria-label="시간 지우기"
        disabled={props.disabled || readOnly}
        className="min-h-11 min-w-7 rounded-pill text-secondary disabled:opacity-60"
        onClick={() => onChange("")}
      >
        ×
      </button>
    </div>
  );
}
