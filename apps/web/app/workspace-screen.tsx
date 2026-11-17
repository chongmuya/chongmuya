"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useAuth,
  KakaoConnection,
  AuthScreen,
  isFirstSetupComplete,
  firstSetupPath,
} from "@/features/auth/client";
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
  if (!isFirstSetupComplete(account))
    return (
      <main className="app-page">
        <Link href="/">홈</Link>
        <h1>첫 설정을 이어서 진행해 주세요</h1>
        <p>
          이용 유형과 서비스에서 사용할 이름을 설정하면 내 모임과 행사를 관리할
          수 있어요.
        </p>
        <Link
          href={firstSetupPath(`${pathname}${params.size ? `?${params}` : ""}`)}
        >
          첫 설정 이어서 하기
        </Link>
        {mode === "mypage" && (
          <KakaoConnection key={account.id} accountId={account.id} />
        )}
        <AuthScreen />
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
      {mode === "mypage" && (
        <>
          <KakaoConnection key={account.id} accountId={account.id} />
          <AuthScreen />
        </>
      )}
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
          <Link href="/getting-started?guide=1">이용 방식 선택</Link>
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
