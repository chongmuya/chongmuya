"use client";
import { NotificationSettings } from "@/features/notifications/client";
import { useState } from "react";
import { useGroups, GroupSwitcher } from "@/features/groups/client";
import type { SessionRequest } from "@/features/auth/types";
import { Button, buttonStyles } from "@/shared/ui/button";
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
  return (
    <>
      <Link
        href={
          groupId
            ? `/mypage?view=account&group=${groupId}`
            : "/mypage?view=account"
        }
        className="mb-10 flex items-center gap-4 py-2"
      >
        <Image
          src="/images/home/profile.svg"
          alt=""
          width={64}
          height={64}
          className="shrink-0 rounded-full bg-field p-2"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold break-words">{name}님</h1>
          <p className="mt-1 text-sm text-secondary">계정 정보 관리</p>
        </div>
        <span aria-hidden="true" className="text-xl text-secondary">
          ›
        </span>
      </Link>
      {owner ? (
        <Link className={buttonStyles({ variant: "outline" })} href="/owner">
          내 매장
        </Link>
      ) : (
        <MyGroups groupId={groupId} accountId={accountId} request={request} />
      )}
      <Memberships accountId={accountId} request={request} />
      <Link href="/favorites" className="my-4 block">
        개인·모임 매장 즐겨찾기
      </Link>
      <NotificationSettings accountId={accountId} request={request} />
      <Link href="/mypage?view=account" className="my-4 block">
        연락처 인증 및 변경 · 약관 및 개인정보 처리방침
      </Link>
      <Link href="/mypage?view=account" className="my-4 block">
        로그아웃 및 계정 연결
      </Link>
    </>
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
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">내 모임</h2>
        <Link
          href="/groups/new"
          aria-label="모임 만들기"
          className="flex size-control items-center justify-center text-2xl text-secondary"
        >
          ＋
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
            className="min-w-0 flex-1 justify-between rounded-control bg-surface"
            aria-haspopup="dialog"
            aria-expanded={choosing}
            onClick={() => setChoosing(true)}
          >
            <span className="truncate">{selected.name}</span>
            <span aria-hidden="true">⌄</span>
          </Button>
          <Link
            href={`/mypage?view=groups&group=${selected.id}`}
            className={buttonStyles({
              variant: "outline",
              className: "shrink-0 rounded-control text-sm",
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
      ) : groups ? (
        <p className="text-sm text-muted">아직 속한 모임이 없어요.</p>
      ) : (
        !query.isError && <LoadingState>모임 불러오는 중…</LoadingState>
      )}
    </section>
  );
}
