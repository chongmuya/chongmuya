"use client";
import { WithdrawalEntry } from "@/features/account/client";
import { NotificationSettings } from "@/features/notifications/client";
import { useState } from "react";
import { useGroups, GroupSwitcher } from "@/features/groups/client";
import type { SessionRequest } from "@/features/auth/types";
import { Button, buttonStyles } from "@/shared/ui/button";
import { MenuArrow, MenuLink } from "@/shared/ui/menu-link";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import Link from "next/link";
import { Memberships } from "@/features/handovers/client";
import Image from "next/image";

export function AccountNavigation({
  owner,
  name,
  groupId,
  accountId,
  request,
}: {
  owner: boolean;
  name: string;
  groupId: string | null;
  accountId: string;
  request: SessionRequest;
}) {
  const accountHref = groupId
    ? `/mypage?view=account&group=${groupId}`
    : "/mypage?view=account";
  const favoritesHref = groupId ? `/favorites?group=${groupId}` : "/favorites";

  return (
    <div className="mx-[9px] pt-3">
      <Link href={accountHref} className="mb-10 flex items-center gap-5">
        <span className="relative size-16 shrink-0">
          <Image
            src="/images/home/profile-large.svg"
            alt=""
            width={72}
            height={72}
            className="absolute -left-1 -top-1 max-w-none"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold break-words">{name}님</h1>
          <p className="mt-1 text-sm text-secondary">
            계정 정보 및 연락처 관리
          </p>
        </div>
        <MenuArrow />
      </Link>
      {owner ? (
        <Link className={buttonStyles({ variant: "outline" })} href="/owner">
          내 매장
        </Link>
      ) : (
        <MyGroups groupId={groupId} accountId={accountId} request={request} />
      )}
      <Memberships accountId={accountId} request={request} />
      <NotificationSettings accountId={accountId} request={request} />
      <section className="space-y-1">
        <h2 className="mb-3 text-xl font-semibold">계정 관리</h2>
        <MenuLink href={accountHref}>연락처 인증 및 변경</MenuLink>
        <MenuLink href={accountHref}>약관 및 개인정보 처리방침</MenuLink>
        <MenuLink href={favoritesHref}>즐겨찾는 매장</MenuLink>
        <MenuLink href={accountHref}>로그아웃 및 계정 연결</MenuLink>
        <WithdrawalEntry />
      </section>
    </div>
  );
}

function MyGroups({
  groupId,
  accountId,
  request,
}: {
  groupId: string | null;
  accountId: string;
  request: SessionRequest;
}) {
  const query = useGroups(accountId, request);
  const [choosing, setChoosing] = useState(false);
  const groups = isAccessError(query.error) ? undefined : query.data;
  const selected = groups?.find((g) => g.id === groupId) ?? groups?.[0];
  const empty = groups?.length === 0;
  return (
    <section className="space-y-4">
      <div
        className={
          empty
            ? "flex flex-wrap items-start justify-between gap-3"
            : "relative flex h-6 items-center justify-between"
        }
      >
        <div
          className={empty ? "min-w-0 flex-[1_0_min(100%,8rem)]" : undefined}
        >
          <h2 className="text-label">내 모임</h2>
          {empty && (
            <p className="mt-4 text-sm text-muted">아직 속한 모임이 없어요.</p>
          )}
        </div>
        <Link
          href="/groups/new"
          aria-label="모임 만들기"
          className={
            empty
              ? buttonStyles({
                  variant: "outline",
                  className:
                    "ml-auto min-h-[52px] max-w-full rounded-control border-placeholder px-3 text-sm font-normal text-copy",
                })
              : "absolute -right-2 -top-2.5 flex size-control items-center justify-center text-2xl font-normal text-secondary"
          }
        >
          {empty ? "＋ 모임 만들기" : "＋"}
        </Link>
      </div>
      {query.isError && (
        <ErrorState retry={() => void query.refetch()}>
          모임을 불러오지 못했어요.
        </ErrorState>
      )}
      {selected && groups ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="min-h-[52px] min-w-0 flex-1 justify-between rounded-control border-0 bg-surface px-5 font-medium text-copy shadow-card"
            aria-haspopup="dialog"
            aria-expanded={choosing}
            onClick={() => setChoosing(true)}
          >
            <span className="truncate">{selected.name}</span>
            <Image
              src="/images/calendar/scope-arrow.svg"
              width={6.59099}
              height={11.0607}
              alt=""
              className="shrink-0 -rotate-90"
            />
          </Button>
          <Link
            href={`/mypage?view=groups&group=${selected.id}`}
            className={buttonStyles({
              variant: "outline",
              className:
                "min-h-[52px] shrink-0 rounded-control border-placeholder text-sm text-copy",
            })}
          >
            모임 관리
          </Link>
          {choosing && (
            <GroupSwitcher
              groups={groups}
              selected={selected.id}
              view="mypage"
              onClose={() => setChoosing(false)}
            />
          )}
        </div>
      ) : (
        !groups &&
        !query.isError && <LoadingState>모임 불러오는 중…</LoadingState>
      )}
    </section>
  );
}
