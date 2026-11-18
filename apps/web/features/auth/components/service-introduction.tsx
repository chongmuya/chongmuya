"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, buttonStyles } from "@/shared/ui/button";
import { safeReturnPath } from "../lib/return-path";
import { authEntryPath } from "../lib/auth-entry-path";
import { StepLayout } from "@/shared/ui/step-layout";

export function ServiceIntroduction() {
  const [page, setPage] = useState(0);
  const params = useSearchParams();
  const router = useRouter();
  const next = safeReturnPath(params.get("next") ?? "/");
  return (
    <StepLayout
      title="총무야 소개"
      onBack={() =>
        page ? setPage(0) : router.push(authEntryPath("/start", next))
      }
    >
      <div className="flex flex-1 flex-col justify-center px-[17px] py-8">
        <Image
          src="/images/auth/brand-wordmark-orange.svg"
          alt="총무야"
          width={131.2}
          height={47.2}
        />
        <div aria-live="polite" className="mt-12">
          <p className="text-caption text-brand">{page + 1} / 2</p>
          <h1 className="mt-3 text-3xl leading-tight font-bold whitespace-pre-line">
            {page === 0
              ? "모임이 없어도,\n행사 준비를 가볍게"
              : "반복되는 모임은\n한곳에서 관리해요"}
          </h1>
          <p className="mt-5 text-control leading-normal text-muted">
            {page === 0
              ? "개인 행사를 바로 만들거나, 관리 중인 모임에 행사를 연결해 보세요."
              : "모임 이름과 기본 명단을 저장해 두세요. 명단은 이름만으로 등록할 수 있고, 나중에 준비해도 괜찮아요."}
          </p>
        </div>
        <Image
          className="mx-auto my-12"
          src={
            page === 0
              ? "/images/home/calendar-art.svg"
              : "/images/enrollment/group.svg"
          }
          alt=""
          width={page === 0 ? 182.217 : 92.2137}
          height={page === 0 ? 126.716 : 51.95}
        />
        <p className="rounded-control bg-brand/10 p-4 text-caption text-muted">
          여러 매장에 예약 조건을 문자로 문의하고, 링크·QR로 참석을 받을 수
          있어요. 매장 답변을 확인할 수 있으며 제안 선택·예약 확정·정산은 다음
          단계예요.
        </p>
      </div>
      <div className="space-y-2">
        {page === 0 ? (
          <Button className="w-full" onClick={() => setPage(1)}>
            다음
          </Button>
        ) : (
          <Link
            href={authEntryPath("/start", next)}
            className={buttonStyles({ className: "w-full" })}
          >
            시작하기
          </Link>
        )}
        <Link
          href={authEntryPath("/start", next)}
          className="block py-3 text-center text-caption text-muted underline"
        >
          소개 건너뛰기
        </Link>
      </div>
    </StepLayout>
  );
}
