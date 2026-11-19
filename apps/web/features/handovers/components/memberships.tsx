"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { ErrorState } from "@/shared/ui/states";
import { query } from "../api/handovers.api";
export function Memberships({
  accountId,
  request,
}: {
  accountId: string;
  request: SessionRequest;
}) {
  const q = useQuery(
    query<
      { id: string; name: string; groupType: string | null; role: string }[]
    >(
      request,
      ["user", accountId, "memberships"],
      "/api/v1/groups/memberships",
    ),
  );
  if (q.isError)
    return (
      <ErrorState retry={() => void q.refetch()}>
        참여 모임을 불러오지 못했어요.
      </ErrorState>
    );
  const rows = q.data?.filter((r) => r.role === "MEMBER");
  return rows?.length ? (
    <section className="mb-6 rounded-control border border-border p-4">
      <h2 className="font-semibold">일반 멤버로 참여 중</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="py-2 break-words">
            {r.name}
            {r.groupType ? ` · ${r.groupType}` : ""}
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted">
        모임 기본 정보만 보여요. 관리자료 열람·수정은 현재 총무만 할 수 있어요.
        기존 참석 링크는 원래 허용된 범위로 이용할 수 있어요.
      </p>
    </section>
  ) : null;
}
