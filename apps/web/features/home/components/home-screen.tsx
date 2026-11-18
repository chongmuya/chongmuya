"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthScreen,
  firstSetupPath,
  isFirstSetupComplete,
  useAuth,
} from "@/features/auth/client";
import type { Account, SessionRequest } from "@/features/auth/types";
import { useGroups } from "@/features/groups/client";
import { EventSummary } from "@/features/events/client";
import { Button, buttonStyles } from "@/shared/ui/button";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { HomeNavigation } from "./home-navigation";

function EventBanner({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="relative block h-[270px] overflow-hidden rounded-control bg-[radial-gradient(ellipse_at_bottom_right,#fac253_0%,#f7923b_42%,#f46224_84%)] p-5 text-white shadow-card"
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
      <span className="absolute right-7 bottom-5 left-7 flex items-center justify-between text-control">
        새 행사를 계획해 볼까요?
        <span aria-hidden="true" className="text-3xl">
          ›
        </span>
      </span>
    </Link>
  );
}

export function HomeScreen() {
  const { account, status, client } = useAuth();
  if (status === "authenticated" && account)
    return (
      <AccountHome
        key={account.id}
        account={account}
        request={client.request.bind(client)}
      />
    );
  return (
    <main className="mx-auto flex min-h-svh max-w-[402px] flex-col px-5 pt-16 pb-10">
      <header className="mb-10 flex items-center justify-between">
        <Image
          src="/images/auth/brand-wordmark.svg"
          alt="총무야"
          width={96.8}
          height={34.8244}
        />
        <Link className="text-caption text-link underline" href="/start">
          시작하기
        </Link>
      </header>
      {status === "loading" ? (
        <LoadingState>로그인 상태 확인 중…</LoadingState>
      ) : status !== "anonymous" ? (
        <AuthScreen />
      ) : (
        <>
          <h1 className="text-2xl font-bold text-copy">
            첫 행사를 준비해 볼까요?
          </h1>
          <p className="mt-2 mb-8 text-xs text-muted">
            모임 없이도 개인 행사를 만들 수 있어요.
          </p>
          <EventBanner href="/auth?next=%2Fevents" />
          <Link
            href="/restaurants"
            className={buttonStyles({
              variant: "brand-outline",
              className: "mt-5",
            })}
          >
            매장 둘러보기
          </Link>
          <p className="mt-8 text-caption text-muted">
            내 행사와 명단은 로그인한 본인만 볼 수 있어요. 공개 매장은 로그인
            없이 둘러볼 수 있어요.
          </p>
          <Link className={buttonStyles({ className: "mt-6" })} href="/start">
            로그인 · 회원가입
          </Link>
          <Link
            className="mt-4 text-center text-caption text-link underline"
            href="/intro"
          >
            서비스 소개 보기
          </Link>
        </>
      )}
    </main>
  );
}

function AccountHome({
  account,
  request,
}: {
  account: Account;
  request: SessionRequest;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const groups = useGroups(account.id, request);
  const [dialog, setDialog] = useState<"groups" | null>(null);
  const requested = params.get("group");
  const selected = groups.isError
    ? undefined
    : (groups.data?.find((group) => group.id === requested) ??
      (!requested ? groups.data?.[0] : undefined));
  const groupsReady =
    !!groups.data && !groups.isError && (!requested || !!selected);
  const complete = isFirstSetupComplete(account);
  const owner = account.accountType === "owner";
  const eventPath = selected ? `/events?group=${selected.id}` : "/events";
  const createPath = complete ? "/groups/new" : firstSetupPath("/groups/new");
  return (
    <main className="mx-auto flex min-h-svh max-w-[402px] flex-col">
      <header className="flex min-h-[44px] items-center justify-between gap-3 px-5 pt-[clamp(24px,8.77svh,83px)]">
        {owner ? (
          <span className="text-control">사장님 홈</span>
        ) : (
          <Button
            className="min-w-0 border-0 px-1 text-left font-medium"
            variant="outline"
            onClick={() =>
              selected ? setDialog("groups") : router.push(createPath)
            }
          >
            <span className="truncate">{selected?.name ?? "모임 만들기"}</span>
            <span aria-hidden="true" className="ml-2 text-placeholder">
              {selected ? "⌄" : "＋"}
            </span>
          </Button>
        )}
        <Link
          href="/mypage"
          aria-label="마이페이지"
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <Image src="/images/home/profile.svg" alt="" width={36} height={36} />
        </Link>
      </header>
      <div className="space-y-8 px-5 pt-8 pb-12">
        <div>
          <h1 className="text-2xl leading-tight font-bold break-words text-copy">
            {owner
              ? `${account.name ?? "사장"}님, 환영해요!`
              : selected
                ? `${account.nickname ?? account.name ?? "총무"}님, 모임 준비 같이 해요!`
                : "첫 행사를 준비해 볼까요?"}
          </h1>
          <p className="mt-2 text-xs text-muted">
            {owner
              ? "매장 정보를 관리하고 받은 예약 문의에 답변해 주세요."
              : selected
                ? "번거로운 모임 준비, 총무야에서 한 번에 관리해요."
                : "모임 없이도 행사를 준비하고 관리할 수 있어요."}
          </p>
        </div>
        {!complete && (
          <section className="rounded-control bg-brand/10 p-4">
            <h2 className="font-semibold">첫 설정을 이어서 진행해 주세요</h2>
            <p className="my-2 text-caption">
              가입은 완료됐어요. 이용 유형과 표시할 닉네임을 설정해 주세요.
            </p>
            <Link href={firstSetupPath("/")} className={buttonStyles()}>
              첫 설정 이어서 하기
            </Link>
          </section>
        )}
        {owner ? (
          <div className="grid gap-3">
            <Link className={buttonStyles()} href="/owner">
              내 매장
            </Link>
            <Link
              className={buttonStyles({ variant: "outline" })}
              href="/owner/inquiries"
            >
              받은 문의
            </Link>
          </div>
        ) : (
          <>
            {groups.isError ? (
              <ErrorState retry={() => void groups.refetch()} />
            ) : !groups.data ? (
              <LoadingState>모임 불러오는 중…</LoadingState>
            ) : requested && !selected ? (
              <div role="alert">
                <p>접근할 수 없는 모임이에요.</p>
                <Link href="/" className="text-link underline">
                  내 홈으로 돌아가기
                </Link>
              </div>
            ) : null}
            {groupsReady && (
              <EventBanner
                href={complete ? eventPath : firstSetupPath(eventPath)}
              />
            )}
            {complete && groupsReady && (
              <EventSummary
                key={`${account.id}:${selected?.id ?? "all"}`}
                accountId={account.id}
                request={request}
                groupId={selected?.id}
              />
            )}
          </>
        )}
      </div>
      {!owner && (
        <>
          <Link
            href="/restaurants"
            className={buttonStyles({
              variant: "brand-outline",
              className: "mx-5 my-6",
            })}
          >
            매장 둘러보기
          </Link>
          <HomeNavigation groupId={selected?.id ?? requested ?? undefined} />
        </>
      )}
      {dialog === "groups" && (
        <BottomSheet title="모임 전환" onClose={() => setDialog(null)}>
          <ul className="my-5 space-y-2">
            {groups.data?.map((group) => (
              <li key={group.id}>
                <Button
                  className="w-full justify-between"
                  variant={group.id === selected?.id ? "solid" : "outline"}
                  onClick={() => {
                    setDialog(null);
                    router.replace(`/?group=${group.id}`);
                  }}
                >
                  <span className="truncate">{group.name}</span>
                  <span className="text-xs">{group.memberCount}명</span>
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="brand-outline"
            className="w-full"
            onClick={() => router.push(createPath)}
          >
            새 모임 만들기
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={() => setDialog(null)}
          >
            닫기
          </Button>
        </BottomSheet>
      )}
    </main>
  );
}
