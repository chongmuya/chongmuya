"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthScreen,
  firstSetupPath,
  isFirstSetupComplete,
  useAuth,
} from "@/features/auth/client";
import { buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { useGroups } from "../hooks/use-groups";
import { groupMembersQueryOptions } from "../api/groups.queries";
import { GroupRegistration } from "./group-registration";

export function GroupRegistrationScreen() {
  const { status, account, client } = useAuth();
  const router = useRouter();
  const groupId = useSearchParams().get("group");
  const destination = groupId
    ? `/groups/new?group=${encodeURIComponent(groupId)}`
    : "/groups/new";
  if (status === "loading")
    return (
      <main className="app-page">
        <LoadingState>로그인 상태 확인 중…</LoadingState>
      </main>
    );
  if (status === "anonymous")
    return (
      <main className="app-page">
        <h1>
          {groupId
            ? "로그인하고 명단을 추가해 주세요"
            : "로그인하고 모임을 만들어 주세요"}
        </h1>
        <Link
          href={`/auth?next=${encodeURIComponent(destination)}`}
          className={buttonStyles()}
        >
          로그인
        </Link>
        <p>
          <Link href="/">홈으로 가기</Link>
        </p>
      </main>
    );
  if (status !== "authenticated" || !account)
    return (
      <main className="app-page">
        <AuthScreen />
      </main>
    );
  if (!isFirstSetupComplete(account))
    return (
      <main className="app-page">
        <h1>첫 설정을 이어서 진행해 주세요</h1>
        <Link href={firstSetupPath(destination)} className={buttonStyles()}>
          첫 설정 이어서 하기
        </Link>
      </main>
    );
  if (account.accountType === "owner")
    return (
      <main className="app-page">
        <h1>사장님 홈에서 매장을 관리해 주세요</h1>
        <Link href="/owner">사장님 홈으로 가기</Link>
      </main>
    );
  const onNavigate = (path: string) => {
    const current = client.getSnapshot();
    if (
      current.status === "authenticated" &&
      current.account?.id === account.id
    )
      router.replace(path);
  };
  return groupId ? (
    <ExistingRosterRegistration
      key={`${account.id}:${groupId}`}
      accountId={account.id}
      request={client.request.bind(client)}
      groupId={groupId}
      onNavigate={onNavigate}
    />
  ) : (
    <GroupRegistration
      key={account.id}
      accountId={account.id}
      request={client.request.bind(client)}
      onNavigate={onNavigate}
    />
  );
}

function ExistingRosterRegistration({
  accountId,
  request,
  groupId,
  onNavigate,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string;
  onNavigate: (path: string) => void;
}) {
  const groups = useGroups(accountId, request);
  const members = useQuery(
    groupMembersQueryOptions(accountId, groupId, request),
  );
  if (
    (groups.isError && (!groups.data || isAccessError(groups.error))) ||
    (members.isError && (!members.data || isAccessError(members.error)))
  )
    return (
      <main className="app-page">
        <ErrorState
          retry={() => {
            void groups.refetch();
            void members.refetch();
          }}
        />
        <Link href="/mypage?view=groups">내 모임으로 돌아가기</Link>
      </main>
    );
  if (!groups.data || !members.data)
    return (
      <main className="app-page">
        <LoadingState>명단 불러오는 중…</LoadingState>
      </main>
    );
  const group = groups.data.find((item) => item.id === groupId);
  if (!group)
    return (
      <main className="app-page">
        <p role="alert">접근할 수 없는 모임이에요.</p>
        <Link href="/mypage?view=groups">내 모임으로 돌아가기</Link>
      </main>
    );
  return (
    <GroupRegistration
      accountId={accountId}
      request={request}
      target={{ group, members: members.data }}
      onNavigate={onNavigate}
    />
  );
}
