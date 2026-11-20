"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "./input";
import { cn } from "../lib/cn";

export function PasswordInput({
  className,
  hideToggleWhenEmpty = false,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
  hideToggleWhenEmpty?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const hideEmptyToggle = hideToggleWhenEmpty && !visible;
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(
          "peer pr-16",
          hideEmptyToggle && "placeholder-shown:pr-4",
          className,
        )}
      />
      <button
        type="button"
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible(!visible)}
        className={cn(
          "absolute inset-y-0 right-2 min-w-12 rounded-pill px-2 text-caption text-muted disabled:cursor-not-allowed",
          hideEmptyToggle && "peer-placeholder-shown:hidden",
        )}
      >
        {visible ? "숨김" : "보기"}
      </button>
    </div>
  );
}
