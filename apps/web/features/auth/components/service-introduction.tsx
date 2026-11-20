"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, buttonStyles } from "@/shared/ui/button";
import { safeReturnPath } from "../lib/return-path";
import { authEntryPath } from "../lib/auth-entry-path";
import { IntroductionArt } from "./introduction-art";

const slides = [
  {
    title: "전화 세 번 돌리던 일을 한 번에",
    description:
      "인원·날짜·예산·공간 조건을 한 번만 적으면 최대 3곳에 같은 내용으로 문의가 가요.",
  },
  {
    title: "받은 답을 나란히 놓고 고르기만",
    description:
      "매장마다 제각각이던 답을 같은 항목으로 정리해요. 한 곳을 고르면 나머지 문의는 자동 종료돼요.",
  },
  {
    title: "참석·정산까지 한 곳에서",
    description:
      "행사의 참석을 확인하고 비용을 나눠 정산해요. 정산문을 공유하고 영수증도 함께 보관할 수 있어요.",
  },
];

export function ServiceIntroduction() {
  const [page, setPage] = useState(0);
  const params = useSearchParams();
  const next = safeReturnPath(params.get("next") ?? "/");
  const start = authEntryPath("/start", next);
  const changePage = (value: number) => {
    setPage(value);
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  };
  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-[402px] flex-col overflow-x-clip bg-background pb-[max(40px,env(safe-area-inset-bottom))]">
      <IntroductionArt page={page} />
      <div
        className="px-9 pt-[54px] text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sr-only">
          총무야 소개 {page + 1} / {slides.length}
        </span>
        <h1 className="text-2xl leading-tight font-bold break-keep">
          {slides[page]!.title}
        </h1>
        <p className="mt-5 text-base leading-normal font-medium break-keep text-[#808087]">
          {slides[page]!.description}
        </p>
      </div>
      <div className="mt-auto px-[17px] pt-8">
        <div className="mb-2 flex min-h-11 items-center justify-between gap-4">
          {page > 0 ? (
            <Button
              variant="outline"
              className="border-0 px-2 text-sm text-secondary"
              onClick={() => changePage(page - 1)}
            >
              이전
            </Button>
          ) : (
            <span />
          )}
          {page < 2 && (
            <Link
              href={start}
              className="flex min-h-11 items-center px-2 text-sm text-secondary"
            >
              건너뛰기
            </Link>
          )}
        </div>
        {page < 2 ? (
          <Button
            variant="brand-outline"
            className="w-full text-brand"
            onClick={() => changePage(page + 1)}
          >
            다음
          </Button>
        ) : (
          <Link
            href={start}
            className={buttonStyles({
              className: "w-full border-brand bg-brand",
            })}
          >
            시작하기
          </Link>
        )}
      </div>
    </main>
  );
}
