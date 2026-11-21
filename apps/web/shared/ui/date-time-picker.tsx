"use client";
import type { ComponentProps } from "react";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";
export function DateTimePicker({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof DatePicker>, "min" | "max">) {
  const [date = "", time = ""] = value.split("T");
  const set = (d: string, t: string) => onChange(!d && !t ? "" : `${d}T${t}`);
  return (
    <div className="grid min-w-0 gap-2">
      <DatePicker
        {...props}
        value={date}
        onChange={(d) => set(d, d ? time : "")}
      />
      <TimePicker
        id={props.id ? `${props.id}-time` : undefined}
        name={props.name}
        value={time}
        onChange={(t) => set(date, t)}
        onBlur={props.onBlur as ComponentProps<typeof TimePicker>["onBlur"]}
        disabled={props.disabled}
        readOnly={props.readOnly}
        aria-label={props["aria-label"]}
        aria-invalid={props["aria-invalid"]}
        aria-describedby={props["aria-describedby"]}
      />
    </div>
  );
}
