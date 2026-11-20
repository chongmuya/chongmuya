"use client";
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import type { ComponentProps } from "react";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";
import { DateTimePicker } from "./date-time-picker";
import { Input } from "./input";
export function FormInput<T extends FieldValues>({
  control,
  name,
  type,
  allowEndOfDay,
  ...props
}: Omit<
  ComponentProps<typeof Input>,
  "name" | "ref" | "onChange" | "value" | "onBlur"
> & {
  control: Control<T>;
  name: Path<T>;
  allowEndOfDay?: boolean;
}) {
  const {
    field: { ref: inputRef, ...field },
  } = useController({ control, name });
  const common = {
    id: props.id,
    name,
    value: String(field.value ?? ""),
    onChange: field.onChange,
    onBlur: field.onBlur,
    disabled: props.disabled,
    readOnly: props.readOnly,
    className: props.className,
    "aria-invalid": props["aria-invalid"],
    "aria-describedby": props["aria-describedby"],
    "aria-label": props["aria-label"],
  };
  if (type === "date")
    return (
      <DatePicker
        {...common}
        ref={inputRef}
        min={typeof props.min === "string" ? props.min : undefined}
        max={typeof props.max === "string" ? props.max : undefined}
      />
    );
  if (type === "time")
    return (
      <TimePicker {...common} ref={inputRef} allowEndOfDay={allowEndOfDay} />
    );
  if (type === "datetime-local")
    return <DateTimePicker {...common} ref={inputRef} />;
  return (
    <Input
      {...props}
      {...field}
      ref={inputRef}
      value={field.value ?? ""}
      type={type}
    />
  );
}
