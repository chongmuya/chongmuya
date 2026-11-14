"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { useGroups } from "../hooks/use-groups";
import type { Group } from "../types/group.types";
import { GroupForm } from "./group-form";

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
  const router = useRouter();
  const groups = useGroups(accountId, request);
  const selected =
    groups.data?.find((group) => group.id === groupId) ??
    (!groupId ? groups.data?.[0] : undefined);
  if (groups.isError) return <ErrorState retry={() => void groups.refetch()} />;
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
        <GroupForm
          accountId={accountId}
          request={request}
          title="모임 만들기"
          onCreated={(group) =>
            router.replace(`/mypage?group=${encodeURIComponent(group.id)}`)
          }
        />
      </section>
    );
  return selected ? children(selected, groups.data) : null;
}
