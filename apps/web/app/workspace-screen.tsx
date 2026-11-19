"use client";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  EventForm,
  EventDetail,
  EventNavigation,
  eventKeys,
} from "@/features/events/client";

import { AccountNavigation } from "@/features/home/client";
import { buttonStyles } from "@/shared/ui/button";
import { StepLayout } from "@/shared/ui/step-layout";

type Mode = "events" | "mypage";
export function WorkspaceScreen({ mode }: { mode: Mode }) {
  const { client, status, account } = useAuth();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const cache = useQueryClient();
  if (status !== "authenticated" || !account)
    return (
      <StepLayout
        variant="flow"
        title={mode === "mypage" ? "마이페이지" : ""}
        onBack={() => router.push("/")}
      >
        {status === "anonymous" ? (
          <section>
            <h1 className="mb-6 text-2xl font-bold">
              로그인하고 이어서 진행해 주세요
            </h1>
            <Link
              className={buttonStyles({ className: "w-full" })}
              href={`/start?next=${encodeURIComponent(`${pathname}${params.size ? `?${params}` : ""}`)}`}
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
  const detailPage =
    mode === "events" &&
    (params.get("action") === "add" ||
      !!params.get("participant") ||
      !!params.get("review"));
  const content = (
    <WorkspaceContent
      key={`${account.id}:${mode}:${params.toString()}`}
      accountId={account.id}
      request={client.request.bind(client)}
      groupId={params.get("group")}
      eventId={params.get("event")}
      mode={mode}
      view={params.get("view")}
      roundId={params.get("round")}
      detailPage={detailPage}
    />
  );
  if (detailPage) return content;
  return (
    <StepLayout
      variant="flow"
      title={mode === "mypage" ? "마이페이지" : ""}
      onBack={() => {
        if (mode === "mypage" && params.get("view"))
          return router.replace(
            params.get("group")
              ? `/mypage?group=${encodeURIComponent(params.get("group")!)}`
              : "/mypage",
          );
        const id = params.get("event");
        const event =
          id && mode === "events"
            ? cache.getQueryData<{ groupId: string | null }>(
                eventKeys.detail(account.id, id),
              )
            : undefined;
        const group = event?.groupId ?? params.get("group");
        router.replace(
          group ? `/?group=${group}` : event ? "/?view=personal" : "/",
        );
      }}
    >
      {mode === "mypage" && params.get("view") === "account" ? (
        <div className="space-y-8">
          <AuthScreen />
          <KakaoConnection key={account.id} accountId={account.id} />
        </div>
      ) : mode === "mypage" && params.get("view") !== "groups" ? (
        <AccountNavigation
          groupId={params.get("group")}
          accountId={account.id}
          request={client.request.bind(client)}
          owner={account.accountType === "owner"}
          name={account.nickname ?? account.name ?? "회원"}
        />
      ) : (
        content
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
  detailPage = false,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  eventId: string | null;
  mode: Mode;
  view?: string | null;
  roundId?: string | null;
  detailPage?: boolean;
}) {
  return (
    <section className="text-copy">
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
          {!detailPage && (
            <>
              <EventDetail
                accountId={accountId}
                request={request}
                eventId={eventId}
              />
              <EventNavigation eventId={eventId} view={view} />
            </>
          )}
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
        <EventForm
          accountId={accountId}
          request={request}
          groupId={groupId ?? undefined}
        />
      )}
    </section>
  );
}
