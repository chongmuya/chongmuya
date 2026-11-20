"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { ChoiceCard } from "@/shared/ui/choice-card";
import { StepHeading, StepLayout } from "@/shared/ui/step-layout";
import type { Account } from "@/features/auth/types";

type Usage = "group" | "event";

export function GettingStartedFlow({
  accountType,
  onNavigate,
  returnTo,
}: {
  accountType: Account["accountType"];
  onNavigate: (path: string) => void;
  returnTo: string;
}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const owner = accountType === "owner";
  const welcome = owner || showWelcome;
  useEffect(() => {
    container.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [welcome]);
  if (owner)
    return (
      <div ref={container}>
        <StepLayout title="" onBack={() => onNavigate(returnTo)}>
          <div className="px-[17px] pt-[25px]">
            <div className="relative mb-4 size-[84px] rounded-pill bg-brand">
              <Image
                src="/images/enrollment/welcome.svg"
                alt=""
                width={67}
                height={59}
                style={{ width: 67.1996, height: "auto" }}
                className="absolute top-[14px] left-[10px]"
              />
            </div>
            <h1
              tabIndex={-1}
              className="text-2xl leading-[1.2] font-bold text-brand-ink focus:outline-none"
            >
              총무야에 오신 걸 환영해요!
            </h1>
            <p className="mt-2 max-w-[227px] text-control text-muted">
              매장을 등록해 총무들이 단체 예약을 할 수 있게 해주세요.
            </p>
          </div>
          <div className="mt-auto pt-12">
            <Button
              className="w-full font-medium"
              onClick={() =>
                onNavigate(
                  returnTo.startsWith("/owner/register")
                    ? returnTo
                    : "/owner/register",
                )
              }
            >
              매장 등록하기
            </Button>
          </div>
        </StepLayout>
      </div>
    );
  return (
    <div ref={container}>
      <StepLayout
        title=""
        onBack={() =>
          showWelcome ? setShowWelcome(false) : onNavigate(returnTo)
        }
      >
        {!welcome ? (
          <>
            <div className="px-[17px]">
              <StepHeading
                title="어떤 모임을 준비하시나요?"
                description="이용 방식에 맞게 시작할 수 있어요."
              />
            </div>
            <fieldset className="mt-7 space-y-5 px-[13px]">
              <legend className="sr-only">이용 방식</legend>
              <ChoiceCard
                name="usage"
                value="group"
                checked={usage === "group"}
                onChange={() => setUsage("group")}
                className="min-h-[177px] items-center justify-between py-6 text-center"
              >
                <Image
                  src="/images/enrollment/group.svg"
                  alt=""
                  width={92}
                  height={52}
                />
                <span className="mt-7 space-y-2">
                  <span className="block text-label">
                    정기적인 모임을 운영해요
                  </span>
                  <span className="block text-control text-muted">
                    동아리·학생회·학회 등
                  </span>
                </span>
              </ChoiceCard>
              <ChoiceCard
                name="usage"
                value="event"
                checked={usage === "event"}
                onChange={() => setUsage("event")}
                className="min-h-[185px] items-center justify-between py-6 text-center"
              >
                <Image
                  src="/images/enrollment/event.svg"
                  alt=""
                  width={58}
                  height={58}
                />
                <span className="mt-7 space-y-2">
                  <span className="block text-label">
                    이번 행사만 준비할래요
                  </span>
                  <span className="block text-control text-muted">
                    회식·뒤풀이·일회성 행사 등
                  </span>
                </span>
              </ChoiceCard>
            </fieldset>
            <div className="mt-auto space-y-2 pt-12">
              <Button
                className="w-full"
                disabled={!usage}
                onClick={() => setShowWelcome(true)}
              >
                계속하기
              </Button>
              <Button
                variant="brand-outline"
                className="w-full"
                onClick={() => onNavigate(returnTo)}
              >
                나중에 선택하기
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="px-[17px] pt-[25px]">
              <div className="relative mb-4 size-[84px] rounded-pill bg-brand">
                <Image
                  src="/images/enrollment/welcome.svg"
                  alt=""
                  width={67}
                  height={59}
                  className="absolute top-[14px] left-[10px]"
                />
              </div>
              <h1
                tabIndex={-1}
                className="text-2xl leading-tight font-bold focus:outline-none"
              >
                총무야에 오신 걸 환영해요!
              </h1>
              <p className="mt-2 text-control text-muted">
                {usage === "group"
                  ? "모임을 등록해 총무야와 함께 행사를 준비해봐요."
                  : "행사를 등록해 총무야와 함께 준비해봐요."}
              </p>
            </div>
            <div className="mt-auto space-y-2 pt-12">
              <Button
                className="w-full"
                onClick={() =>
                  onNavigate(usage === "group" ? "/groups/new" : "/events")
                }
              >
                {usage === "group" ? "모임 등록하기" : "행사 등록하기"}
              </Button>
              <Button
                className="w-full"
                variant="brand-outline"
                onClick={() => onNavigate(returnTo)}
              >
                {returnTo === "/" ? "홈으로 가기" : "나중에 시작하기"}
              </Button>
            </div>
          </>
        )}
      </StepLayout>
    </div>
  );
}
