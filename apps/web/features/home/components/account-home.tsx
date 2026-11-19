"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Account, SessionRequest } from "@/features/auth/types";
import { GroupSwitcher, useGroups } from "@/features/groups/client";
import { EventSummary, useEvents } from "@/features/events/client";
import { isAccessError } from "@/shared/http/access-error";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";

import { HomeNavigation } from "./home-navigation";

export function AccountHome({
  account,
  request,
}: {
  account: Account;
  request: SessionRequest;
}) {
  const params = useSearchParams();
  const groups = useGroups(account.id, request);
  const [dialog, setDialog] = useState<"groups" | null>(null);
  const personalEvents = useEvents(
    account.id,
    request,
    dialog === "groups" || groups.data?.length === 0,
  );
  const individual = isAccessError(personalEvents.error)
    ? []
    : (personalEvents.data?.filter((e) => !e.groupId) ?? []);
  const requested = params.get("group");
  const personal = params.get("view") === "personal" && !requested;
  const selected =
    personal || isAccessError(groups.error)
      ? undefined
      : (groups.data?.find((group) => group.id === requested) ??
        (!requested ? groups.data?.[0] : undefined));
  const groupsReady =
    !isAccessError(groups.error) &&
    (personal || !!groups.data) &&
    (!requested || !!selected);
  const hasGroups = !!groups.data?.length;

  return (
    <main className="mx-auto flex min-h-svh max-w-[402px] flex-col">
      <header className="flex min-h-[44px] items-center justify-between gap-3 px-5 pt-[clamp(24px,8.77svh,83px)]">
        {hasGroups || requested || individual.length > 0 ? (
          <Button
            className="min-w-0 border-0 px-1 text-left font-medium"
            variant="outline"
            aria-label="모임·행사 선택"
            aria-haspopup="dialog"
            aria-expanded={dialog === "groups"}
            onClick={() => setDialog("groups")}
          >
            <span className="truncate">{selected?.name ?? "개인 행사"}</span>
            <span aria-hidden="true" className="ml-2 text-secondary">
              ⌄
            </span>
          </Button>
        ) : (
          <Link
            href="/groups/new"
            className="inline-flex min-h-control items-center gap-2 text-control"
          >
            모임 만들기{" "}
            <span aria-hidden="true" className="text-secondary">
              ＋
            </span>
          </Link>
        )}
        <Link
          href={selected ? `/mypage?group=${selected.id}` : "/mypage"}
          aria-label="마이페이지"
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <Image src="/images/home/profile.svg" alt="" width={36} height={36} />
        </Link>
      </header>
      <div className="space-y-8 px-5 pt-8 pb-12">
        <div>
          <h1 className="text-2xl leading-tight font-bold break-words text-copy">
            {selected
              ? `${account.nickname ?? account.name ?? "총무"}님, 모임 준비 같이 해요!`
              : "행사를 준비해 볼까요?"}
          </h1>
          <p className="mt-2 text-xs text-secondary">
            {selected
              ? "번거로운 모임 준비, 총무야에서 한 번에 관리해요."
              : "행사를 한 번에 준비하고 관리할 수 있어요."}
          </p>
        </div>
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
        {!requested && groups.isError && !groupsReady && (
          <Link href="/events" className="text-link underline">
            개인 행사 만들기
          </Link>
        )}
        {groupsReady && (
          <EventSummary
            key={`${account.id}:${selected?.id ?? "all"}`}
            accountId={account.id}
            request={request}
            groupId={selected?.id}
            personal={personal || !selected}
          />
        )}
      </div>
      {(selected || requested) && (
        <HomeNavigation groupId={selected?.id ?? requested!} />
      )}
      {dialog === "groups" && (
        <GroupSwitcher
          groups={isAccessError(groups.error) ? [] : (groups.data ?? [])}
          selected={selected?.id}
          view="home"
          createPath="/groups/new"
          onClose={() => setDialog(null)}
        >
          {individual.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events?event=${event.id}`}
                className="block rounded-control px-4 py-3 text-sm"
                onClick={() => setDialog(null)}
              >
                {event.name}
                <span className="ml-2 text-xs text-muted">개인 행사</span>
              </Link>
            </li>
          ))}
          {personalEvents.isError && (
            <li>
              <ErrorState retry={() => void personalEvents.refetch()}>
                개인 행사를 불러오지 못했어요.
              </ErrorState>
            </li>
          )}
          {groups.isError ? (
            <li>
              <ErrorState retry={() => void groups.refetch()}>
                모임을 불러오지 못했어요.
              </ErrorState>
            </li>
          ) : !groups.data ? (
            <li>
              <LoadingState>모임 불러오는 중…</LoadingState>
            </li>
          ) : null}
        </GroupSwitcher>
      )}
    </main>
  );
}
