"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonStyles } from "@/shared/ui/button";
import { NoticeDialog } from "@/shared/ui/notice-dialog";
import { authEntryPath } from "../lib/auth-entry-path";
import { AuthLayout } from "./auth-layout";

export function StartScreen({ returnTo }: { returnTo: string }) {
  const [guest, setGuest] = useState(false);
  return (
    <AuthLayout title="총무야 시작하기" start>
      <Link
        href={`/intro?next=${encodeURIComponent(returnTo)}`}
        className="absolute top-8 right-4 text-caption text-brand-ink underline"
      >
        서비스 소개
      </Link>
      <div className="mt-auto pt-16">
        <div className="flex flex-col gap-2">
          <Link
            href={authEntryPath("/auth/signup", returnTo)}
            className={buttonStyles({ variant: "ink" })}
          >
            처음 가입해요
          </Link>
          <Link
            href={authEntryPath("/auth", returnTo)}
            className={buttonStyles({ variant: "outline" })}
          >
            이미 계정이 있어요
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setGuest(true)}
          className="mx-auto mt-8 block w-fit text-center text-caption text-black underline underline-offset-2"
        >
          회원가입 없이 사용해볼래요
        </button>
      </div>
      {guest && (
        <NoticeDialog
          title="회원가입 없이 진행할까요?"
          description="서비스를 먼저 둘러볼 수 있어요. 내 행사나 모임·명단을 저장할 때는 회원가입과 로그인이 필요해요."
          onClose={() => setGuest(false)}
        >
          <Link
            href="/"
            className={buttonStyles({
              variant: "brand-outline",
              className: "text-caption",
            })}
          >
            가입 없이 계속하기
          </Link>
          <Link
            href={authEntryPath("/auth/signup", returnTo)}
            className={buttonStyles({ className: "text-caption" })}
          >
            회원가입하기
          </Link>
        </NoticeDialog>
      )}
    </AuthLayout>
  );
}
