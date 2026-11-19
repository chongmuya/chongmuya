import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui/icon-button";

export function AuthLayout({
  children,
  title,
  start = false,
  backHref,
}: {
  children: ReactNode;
  title: string;
  start?: boolean;
  backHref?: string;
}) {
  return (
    <main className="min-h-svh bg-brand bg-[url(/images/auth/background.svg)] bg-size-[100%_100%] bg-no-repeat">
      <div
        className={cn(
          "relative mx-auto flex min-h-svh w-full max-w-[402px] flex-col px-4 pt-[clamp(96px,25.2643svh,239px)] pb-[max(40px,env(safe-area-inset-bottom))]",
          start &&
            "pb-[max(clamp(32px,8.6444svh,81.776px),env(safe-area-inset-bottom))]",
        )}
      >
        <h1 className="sr-only">{title}</h1>
        {backHref && (
          <IconButton
            href={backHref}
            aria-label="시작 화면으로 돌아가기"
            className="absolute top-[max(clamp(16px,6.0254svh,57px),env(safe-area-inset-top))] left-2"
          >
            <Image
              src="/images/ui/back.svg"
              alt=""
              width={10}
              height={18}
              className="h-auto w-[10.4142px]"
            />
          </IconButton>
        )}
        <div className="flex shrink-0 flex-col items-center gap-[14.9713px]">
          <Image
            src="/images/auth/brand-symbol.svg"
            alt=""
            width={67}
            height={59}
            priority
          />
          <Image
            src="/images/auth/brand-wordmark.svg"
            alt="총무야"
            width={97}
            height={35}
            priority
          />
        </div>
        {children}
      </div>
    </main>
  );
}
