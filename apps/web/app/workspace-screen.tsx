"use client";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  useAuth,
  KakaoConnection,
  AuthScreen,
  isFirstSetupComplete,
  firstSetupPath,
} from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { GroupBoundary, GroupSettings } from "@/features/groups/client";
import { AttendanceWorkspace, EventRoster } from "@/features/attendance/client";
import { ReservationProgress } from "@/features/reservations/client";
import { EventList, EventDetail } from "@/features/events/client";

import { StepLayout } from "@/shared/ui/step-layout";

type Mode = "events" | "mypage" | "onboarding";
export function WorkspaceScreen({ mode }: { mode: Mode }) {
  const { client, status, account } = useAuth();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  if (status !== "authenticated" || !account)
    return (
      <StepLayout
        variant="flow"
        title={mode === "mypage" ? "마이페이지" : ""}
        onBack={() => router.push("/")}
      >
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
      </StepLayout>
    );
  if (!isFirstSetupComplete(account))
    return (
      <StepLayout
        variant="flow"
        title={mode === "mypage" ? "마이페이지" : ""}
        onBack={() => router.push("/")}
      >
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
      </StepLayout>
    );
  return (
    <StepLayout
      variant="flow"
      title={mode === "mypage" ? "마이페이지" : ""}
      onBack={() => router.push("/")}
    >
      <WorkspaceContent
        key={`${account.id}:${mode}:${params.toString()}`}
        accountId={account.id}
        request={client.request.bind(client)}
        groupId={params.get("group")}
        eventId={params.get("event")}
        mode={mode}
        view={params.get("view")}
        roundId={params.get("round")}
      />
      {mode === "mypage" && (
        <>
          <KakaoConnection key={account.id} accountId={account.id} />
          <AuthScreen />
        </>
      )}
    </StepLayout>
  );
}
export function WorkspaceContent({
  accountId,
  request,
  groupId,
  eventId,
  mode,
  view,
  roundId,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  eventId: string | null;
  mode: Mode;
  view?: string | null;
  roundId?: string | null;
}) {
  return (
    <section className="text-copy">
      {(mode === "mypage" || eventId) && (
        <h1 className="mb-7 text-2xl font-bold">
          {mode === "mypage" ? "내 모임 관리" : "내 행사"}
        </h1>
      )}
      {mode === "mypage" ? (
        <GroupBoundary
          accountId={accountId}
          request={request}
          groupId={groupId}
        >
          {(selected, groups) => (
            <GroupSettings
              key={`${accountId}:${selected.id}`}
              accountId={accountId}
              request={request}
              selected={selected}
              groups={groups}
            />
          )}
        </GroupBoundary>
      ) : eventId ? (
        <>
          <EventDetail
            accountId={accountId}
            request={request}
            eventId={eventId}
          />
          <nav
            aria-label="행사 관리"
            className="mb-7 flex gap-2 border-b border-border pb-3 text-sm"
          >
            {[
              ["reservation", "예약"],
              ["attendance", "참석 관리"],
              ["roster", "명단 관리"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={`/events?event=${eventId}&view=${value}`}
                className={`flex-1 rounded-pill px-2 py-3 text-center ${(view ?? "reservation") === value ? "bg-brand text-white" : "text-muted"}`}
                aria-current={
                  (view ?? "reservation") === value ? "page" : undefined
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          {view === "attendance" ? (
            <AttendanceWorkspace
              accountId={accountId}
              eventId={eventId}
              request={request}
              roundId={roundId ?? null}
            />
          ) : view === "roster" ? (
            <EventRoster
              accountId={accountId}
              eventId={eventId}
              request={request}
            />
          ) : (
            <ReservationProgress
              accountId={accountId}
              eventId={eventId}
              request={request}
            />
          )}
        </>
      ) : (
        <EventList
          accountId={accountId}
          request={request}
          groupId={groupId ?? undefined}
        />
      )}
      <nav className="mt-10 flex flex-wrap gap-3 text-xs text-secondary [&_a]:rounded-pill [&_a]:border [&_a]:border-field [&_a]:px-3 [&_a]:py-2">
        <Link href="/">홈</Link>
        <Link href="/events">내 행사</Link>
        <Link href="/mypage">마이페이지</Link>
        {mode === "mypage" && (
          <Link href="/getting-started?guide=1">이용 방식 선택</Link>
        )}
      </nav>
    </section>
  );
}
