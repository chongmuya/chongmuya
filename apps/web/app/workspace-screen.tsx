"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth, AuthScreen } from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { GroupBoundary, GroupSettings } from "@/features/groups/client";
import { EventList, EventDetail } from "@/features/events/client";

type Mode = "events" | "mypage" | "onboarding";
export function WorkspaceScreen({ mode }: { mode: Mode }) {
  const { client, status, account } = useAuth();
  const params = useSearchParams();
  const pathname = usePathname();
  if (status !== "authenticated" || !account)
    return (
      <main className="app-page">
        <Link href="/">홈</Link>
        {status === "anonymous" ? (
          <section>
            <h1>로그인이 필요합니다</h1>
            <Link
              href={`/auth?next=${encodeURIComponent(`${pathname}${params.size ? `?${params}` : ""}`)}`}
            >
              로그인 · 회원가입
            </Link>
          </section>
        ) : (
          <AuthScreen />
        )}
      </main>
    );
  return (
    <main className="app-page">
      <WorkspaceContent
        key={`${account.id}:${mode}:${params.toString()}`}
        accountId={account.id}
        request={client.request.bind(client)}
        groupId={params.get("group")}
        eventId={params.get("event")}
        mode={mode}
      />
      {mode === "mypage" && <AuthScreen />}
    </main>
  );
}
export function WorkspaceContent({
  accountId,
  request,
  groupId,
  eventId,
  mode,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  eventId: string | null;
  mode: Mode;
}) {
  return (
    <section>
      <nav>
        <Link href="/">홈</Link>
        <Link href="/events">내 행사</Link>
        <Link href="/mypage">마이페이지</Link>
        {mode === "mypage" && (
          <Link href="/getting-started">이용 방식 선택</Link>
        )}
      </nav>
      <h1>{mode === "mypage" ? "내 모임 관리" : "내 행사"}</h1>
      {mode === "mypage" ? (
        <GroupBoundary
          accountId={accountId}
          request={request}
          groupId={groupId}
        >
          {(selected, groups) => (
            <GroupSettings
              accountId={accountId}
              request={request}
              selected={selected}
              groups={groups}
            />
          )}
        </GroupBoundary>
      ) : eventId ? (
        <EventDetail
          accountId={accountId}
          request={request}
          eventId={eventId}
        />
      ) : (
        <EventList
          accountId={accountId}
          request={request}
          groupId={groupId ?? undefined}
        />
      )}
    </section>
  );
}
