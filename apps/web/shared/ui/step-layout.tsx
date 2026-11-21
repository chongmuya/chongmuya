import Image from "next/image";
import type { ReactNode } from "react";
import { IconButton } from "@/shared/ui/icon-button";
import { cn } from "../lib/cn";

export function StepLayout({
  title,
  onBack,
  busy,
  progress,
  action,
  children,
  variant = "default",
  className,
}: {
  variant?: "default" | "flow" | "owner";
  title: string;
  onBack: () => void;
  busy?: boolean;
  progress?: { value: number; max: number };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-svh w-full max-w-[402px] flex-col bg-background px-[17px] pt-[max(clamp(16px,6.0254svh,57px),env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]",
        variant === "flow" && "px-5 text-copy",
        className,
      )}
    >
      <header
        className={cn(
          "relative mb-[18px] flex min-h-control shrink-0 items-center justify-center",
          variant === "flow" && "mb-11",
        )}
      >
        <IconButton
          onClick={onBack}
          disabled={busy}
          aria-label="이전 단계로 돌아가기"
          className="absolute -left-2"
        >
          <Image
            src="/images/ui/back.svg"
            alt=""
            width={10}
            height={18}
            style={{ width: "10.4142px", height: "auto" }}
          />
        </IconButton>
        {progress ? (
          <progress
            aria-label={title || "등록 진행"}
            className="mr-[17px] ml-[35px] h-1.5 w-auto flex-1 overflow-hidden rounded-pill border-0 bg-placeholder/20 [&::-webkit-progress-bar]:bg-placeholder/20 [&::-webkit-progress-value]:rounded-pill [&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand"
            value={progress.value}
            max={progress.max}
          />
        ) : title ? (
          <p className="px-12 text-center text-label">{title}</p>
        ) : null}
        {action && <div className="absolute -right-2">{action}</div>}
      </header>
      {children}
    </main>
  );
}

export function StepHeading({
  title,
  description,
  className,
  descriptionClassName,
}: {
  title: string;
  description?: string;
  className?: string;
  descriptionClassName?: string;
}) {
  return (
    <div className={cn("mb-12", className)}>
      <h1
        tabIndex={-1}
        className="focus:outline-none text-2xl leading-[1.2] font-bold wrap-break-word"
      >
        {title}
      </h1>
      {description && (
        <p
          className={cn(
            "mt-1 text-xs leading-normal text-muted",
            descriptionClassName,
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
