"use client";
import { isAccessError } from "@/shared/http/access-error";
import type { ReactNode } from "react";
import Link from "next/link";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { useGroups } from "../hooks/use-groups";
import type { Group } from "../types/group.types";
import { buttonStyles } from "@/shared/ui/button";

// Only the group management page needs a selected group. Events are independent.
export function GroupBoundary({
  accountId,
  request,
  groupId,
  children,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  children: (group: Group, groups: Group[]) => ReactNode;
}) {
  const groups = useGroups(accountId, request);
  const selected =
    groups.data?.find((group) => group.id === groupId) ??
    (!groupId ? groups.data?.[0] : undefined);
  if (groups.isError && (!groups.data || isAccessError(groups.error)))
    return <ErrorState retry={() => void groups.refetch()} />;
  if (!groups.data) return <LoadingState>모임 확인 중…</LoadingState>;
  if (groupId && !selected)
    return (
      <section>
        <h2>접근할 수 없는 모임입니다</h2>
        <Link href="/mypage">내 모임 보기</Link>
      </section>
    );
  if (!groups.data.length)
    return (
      <section>
        <h2>아직 모임이 없습니다</h2>
        <p>
          모임은 필요할 때 만들 수 있습니다.{" "}
          <Link href="/events">개인 행사 이용하기</Link>
        </p>
        <Link href="/groups/new" className={buttonStyles()}>
          모임 만들기
        </Link>
      </section>
    );
  return selected ? (
    <>
      {groups.isError && (
        <ErrorState retry={() => void groups.refetch()}>
          최신 모임 정보를 불러오지 못했어요.
        </ErrorState>
      )}
      {children(selected, groups.data)}
    </>
  ) : null;
}
