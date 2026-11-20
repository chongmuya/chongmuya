import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import type { EventSummary } from "@/features/settlements/types";
import type { Event } from "../types/event.types";
import {
  compactEventDate,
  homeEventPath,
  homeAction,
  reservationLabel,
  settlementLabel,
} from "../lib/home-event";

const background =
  "rounded-control bg-[radial-gradient(ellipse_at_bottom_right,#fac253_0%,#f7923b_42%,#f46224_84%)] text-white shadow-card";

export function EventBanner({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={cn("relative block h-[270px] overflow-hidden p-5", background)}
    >
      <span className="block text-2xl leading-tight font-bold">
        행사 준비,
        <br />
        총무야와 시작해요!
      </span>
      <Image
        src="/images/home/calendar-art.svg"
        alt=""
        width={182.217}
        height={126.716}
        className="absolute top-[93px] right-9"
      />
      <span className="absolute right-7 bottom-5 left-7 flex min-h-11 items-center justify-between gap-3 text-control">
        새 행사를 계획해 볼까요?
        <Image
          src="/images/home/banner-next.svg"
          width={11.6213}
          height={19}
          alt=""
          className="shrink-0 rotate-180"
        />
      </span>
    </Link>
  );
}

export function ActiveEventBanner({
  event,
  summary,
  summaryUnavailable = false,
}: {
  event: Event;
  summary?: EventSummary;
  summaryUnavailable?: boolean;
}) {
  const next = homeAction(summary);
  const steps = [
    {
      view: "reservation",
      label: "예약",
      icon: "reservation",
      width: 29.0562,
      height: 24.5756,
      state: reservationLabel(summary).replace(/^예약 /, ""),
      complete: summary?.reservation?.progress === "CONFIRMED",
    },
    {
      view: "attendance",
      label: "참석",
      icon: "attendance",
      width: 26.112,
      height: 29.184,
      state: summary
        ? summary.roundCount
          ? `${summary.attendingCount}명 참석`
          : "명단 준비"
        : "확인 중",
    },
    {
      view: "settlement",
      label: "정산",
      icon: "settlement",
      width: 25.4976,
      height: 29.184,
      state: settlementLabel(summary).replace(/^정산 /, ""),
      complete:
        summary?.settlement.status === "COMPLETE" &&
        !summary.settlement.needsReview,
    },
    {
      view: "record",
      label: "기록",
      icon: "record",
      width: 28.54,
      height: 26.5402,
      state: "기록 보기",
    },
  ];
  return (
    <section
      aria-label={`${event.name} 진행 안내`}
      className={cn("focus-on-brand min-h-[270px] p-5 pb-3", background)}
    >
      <div className="flex items-end gap-3">
        <h3 className="text-2xl leading-[1.2] font-bold whitespace-pre-line">
          {!summary && summaryUnavailable
            ? "행사 진행 상태를\n확인하지 못했어요"
            : next.title}
        </h3>
        <Image
          src="/images/home/banner-mark.svg"
          alt=""
          width={41.3793}
          height={36.5939}
          className="mb-1 shrink-0 -rotate-15"
        />
      </div>
      <p className="mt-2 text-xs leading-[1.2] break-words">
        {event.name} · {compactEventDate(event.scheduledAt)}
      </p>
      <nav
        aria-label="대표 행사 바로가기"
        className="relative mt-8 grid grid-cols-4 gap-1 before:absolute before:right-0 before:bottom-2 before:left-0 before:border-b before:border-dotted before:border-white/60"
      >
        {steps.map((step, index) => (
          <Link
            key={step.view}
            href={homeEventPath(event, step.view)}
            aria-label={`${step.label}: ${step.state}`}
            className="relative flex h-[73px] min-w-0 flex-col items-center gap-1 text-center"
          >
            <span className="flex h-[30px] items-center">
              <Image
                src={`/images/home/step-${step.icon}.svg`}
                width={step.width}
                height={step.height}
                alt=""
              />
            </span>
            <span
              className={cn(
                "text-xs",
                next.view === step.view ? "font-semibold" : "text-white/60",
              )}
            >
              {step.label}
            </span>
            <span
              aria-hidden="true"
              className="mt-auto flex size-4 items-center justify-center"
            >
              {next.view === step.view ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-secondary text-xs leading-none text-white">
                  {index + 1}
                </span>
              ) : step.complete ? (
                <Image
                  src="/images/home/step-complete.svg"
                  width={15.6}
                  height={15.6}
                  alt=""
                />
              ) : (
                <span className="size-1.5 rounded-full bg-white" />
              )}
            </span>
          </Link>
        ))}
      </nav>
      <Link
        href={homeEventPath(event, next.view)}
        className="mt-2 flex min-h-11 items-center justify-between gap-3 px-2 text-base font-medium"
      >
        {next.action}
        <Image
          src="/images/home/banner-next.svg"
          width={11.6213}
          height={19}
          alt=""
          className="shrink-0 rotate-180"
        />
      </Link>
    </section>
  );
}
