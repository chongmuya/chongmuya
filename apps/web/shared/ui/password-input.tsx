"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "./input";
import { cn } from "../lib/cn";

export function PasswordInput({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-16", className)}
      />
      <button
        type="button"
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible(!visible)}
        className="absolute inset-y-0 right-2 min-w-12 rounded-pill px-2 text-caption text-muted disabled:cursor-not-allowed"
      >
        {visible ? "숨김" : "보기"}
      </button>
    </div>
  );
}
