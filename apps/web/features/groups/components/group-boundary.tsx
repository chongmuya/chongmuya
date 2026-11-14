"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { groupsQueryOptions } from "../api/groups.queries";
import type { Group } from "../types/group.types";
import { GroupForm } from "./group-form";

export function GroupBoundary({
  accountId,
  request,
  groupId,
  onboarding,
  children,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  onboarding: boolean;
  children: (group: Group, groups: Group[]) => ReactNode;
}) {
  const router = useRouter();
  const groups = useQuery(groupsQueryOptions(accountId, request));
  const selected =
    groups.data?.find((group) => group.id === groupId) ??
    (!groupId ? groups.data?.[0] : undefined);
  useEffect(() => {
    if (!groups.isError && groups.data?.length && onboarding)
      router.replace(`/events?group=${encodeURIComponent(groups.data[0].id)}`);
  }, [groups.data, groups.isError, onboarding, router]);
  if (groups.isError) return <ErrorState retry={() => void groups.refetch()} />;
  if (!groups.data) return <LoadingState>모임 확인 중…</LoadingState>;
  if (!groups.data.length)
    return (
      <section>
        <h1>첫 모임을 만들어 주세요</h1>
        <p>모임 이름만 있으면 시작할 수 있어요.</p>
        <GroupForm
          accountId={accountId}
          request={request}
          title="모임 만들기"
          onCreated={(group) =>
            router.replace(`/events?group=${encodeURIComponent(group.id)}`)
          }
        />
      </section>
    );
  if (!selected)
    return (
      <section>
        <h1>접근할 수 없는 모임입니다</h1>
        <Link href="/events">내 모임으로 돌아가기</Link>
      </section>
    );
  return children(selected, groups.data);
}
