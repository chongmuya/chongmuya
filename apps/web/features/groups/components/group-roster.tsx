"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import Link from "next/link";
import { buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { groupMembersQueryOptions } from "../api/groups.queries";

export function GroupRoster({
  accountId,
  groupId,
  request,
}: {
  accountId: string;
  groupId: string;
  request: SessionRequest;
}) {
  const members = useQuery(
    groupMembersQueryOptions(accountId, groupId, request),
  );
  return (
    <section aria-label="저장된 모임 명단">
      <h2>모임 명단</h2>
      <p className="text-caption text-muted">
        명단은 본인만 볼 수 있어요. 회원 초대나 행사 명단 복사는 자동으로
        이루어지지 않아요.
      </p>
      {members.isError ? (
        <ErrorState retry={() => void members.refetch()} />
      ) : !members.data ? (
        <LoadingState>명단 불러오는 중…</LoadingState>
      ) : !members.data.length ? (
        <p>등록된 명단이 없어요. 명단 없이도 행사를 만들 수 있어요.</p>
      ) : (
        <>
          <p>{members.data.length}명</p>
          <ol className="divide-y divide-border rounded-control bg-surface px-4">
            {members.data.map((member, index) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <span className="text-xs text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 break-words">
                  {member.name}
                  {member.label && (
                    <span className="ml-2 text-caption text-muted">
                      ({member.label})
                    </span>
                  )}
                </span>
                <span className="text-caption text-muted">
                  {member.phoneLast4
                    ? `뒤 4자리 ${member.phoneLast4}`
                    : "뒤 4자리 미입력"}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {members.data && !members.isError && (
        <Link
          href={`/groups/new?group=${groupId}`}
          className={buttonStyles({
            variant: "brand-outline",
            className: "mt-4 w-full",
          })}
        >
          구성원 추가하기
        </Link>
      )}
    </section>
  );
}
