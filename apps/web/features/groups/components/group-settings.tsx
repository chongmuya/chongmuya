"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionRequest } from "@/features/auth/types";
import type { Group } from "../types/group.types";
import { GroupForm } from "./group-form";

export function GroupSettings({
  accountId,
  request,
  selected,
  groups,
}: {
  accountId: string;
  request: SessionRequest;
  selected: Group;
  groups: Group[];
}) {
  const router = useRouter();
  return (
    <>
      <h2>관리할 모임 전환</h2>
      <Link href={`/events?group=${encodeURIComponent(selected.id)}`}>
        이 모임의 내 행사 보기
      </Link>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              aria-current={group.id === selected.id ? "true" : undefined}
              href={`/mypage?group=${encodeURIComponent(group.id)}`}
            >
              {group.name}
              {group.id === selected.id ? " (현재 모임)" : ""}
            </Link>
          </li>
        ))}
      </ul>
      <GroupForm
        key={selected.id}
        accountId={accountId}
        request={request}
        group={selected}
        title="모임 이름 수정"
      />
      <GroupForm
        accountId={accountId}
        request={request}
        title="모임 추가"
        onCreated={(group) =>
          router.replace(`/mypage?group=${encodeURIComponent(group.id)}`)
        }
      />
    </>
  );
}
