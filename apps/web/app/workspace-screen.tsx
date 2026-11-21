"use client";
import { isDateOnly } from "@/shared/lib/korean-date";
import { Memberships } from "@/features/handovers/client";
import { AccountSettings, WithdrawalEntry } from "@/features/account/client";
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
import {
  GroupBoundary,
  GroupSettings,
  GroupRosterScreen,
} from "@/features/groups/client";
import { AttendanceWorkspace, EventRoster } from "@/features/attendance/client";
import { ReservationProgress } from "@/features/reservations/client";
import {
  EventForm,
  EventDetail,
  EventNavigation,
  eventKeys,
} from "@/features/events/client";

import {
  SettlementWorkspace,
  RecordsList,
} from "@/features/settlements/client";
import { AccountNavigation } from "@/features/home/client";
import { buttonStyles } from "@/shared/ui/button";
import { StepLayout } from "@/shared/ui/step-layout";
import { OrganizerNavigation } from "@/shared/ui/organizer-navigation";

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
        <p>닉네임을 설정하면 내 모임과 행사를 관리할 수 있어요.</p>
        <Link
          href={firstSetupPath(`${pathname}${params.size ? `?${params}` : ""}`)}
        >
          첫 설정 이어서 하기
        </Link>
        {mode === "mypage" && (
          <>
            <KakaoConnection
              key={`kakao:${account.id}`}
              accountId={account.id}
            />
            <WithdrawalEntry />
          </>
        )}
        <AuthScreen />
      </StepLayout>
    );
  const detailPage =
    mode === "events" &&
    (["add", "import"].includes(params.get("action") ?? "") ||
      !!params.get("participant") ||
      !!params.get("review"));
  const content = (
    <WorkspaceContent
      key={`${account.id}:${mode}:${params.toString()}`}
      accountId={account.id}
      request={client.request.bind(client)}
      initialDate={
        isDateOnly(params.get("date")) ? params.get("date")! : undefined
      }
      groupId={params.get("group")}
      eventId={params.get("event")}
      mode={mode}
      view={params.get("view")}
      startExpense={
        params.get("action") === "expense" &&
        params.get("view") === "settlement"
      }
      personal={params.get("scope") === "personal" && !params.get("group")}
      roundId={params.get("round")}
      detailPage={detailPage}
    />
  );
  if (detailPage) return content;
  if (
    mode === "events" &&
    params.get("view") === "records" &&
    !params.get("event")
  )
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-[402px] flex-col bg-background px-5 pt-[max(clamp(16px,6.0254svh,57px),env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1 pb-8">{content}</div>
        <OrganizerNavigation
          current="records"
          groupId={params.get("group") ?? undefined}
          personal={params.get("scope") === "personal"}
          className="-mx-5"
        />
      </main>
    );
  if (mode === "mypage" && params.get("view") === "roster")
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-[402px] flex-col bg-background px-5 pt-[max(clamp(16px,6.0254svh,57px),env(safe-area-inset-top))]">
        {content}
      </main>
    );
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
          group
            ? `/?group=${group}${id ? `&event=${id}` : ""}`
            : event || params.get("scope") === "personal"
              ? `/?view=personal${id ? `&event=${id}` : ""}`
              : "/",
        );
      }}
    >
      {mode === "mypage" && params.get("view") === "account" ? (
        <div className="space-y-8">
          <AccountSettings key={`settings:${account.id}`} />
          <AuthScreen />
          <KakaoConnection key={`kakao:${account.id}`} accountId={account.id} />
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
  initialDate,
  detailPage = false,
  personal = false,
  startExpense = false,
}: {
  accountId: string;
  request: SessionRequest;
  groupId: string | null;
  eventId: string | null;
  mode: Mode;
  view?: string | null;
  roundId?: string | null;
  detailPage?: boolean;
  personal?: boolean;
  startExpense?: boolean;
  initialDate?: string;
}) {
  return (
    <section
      className={
        mode === "mypage" && view === "roster"
          ? "flex flex-1 flex-col text-copy"
          : mode === "events" && eventId && !detailPage
            ? "-mt-2 text-copy"
            : "text-copy"
      }
    >
      {mode === "mypage" && view === "roster" ? (
        <GroupBoundary
          accountId={accountId}
          request={request}
          groupId={groupId}
          fallbackNavigation={
            <OrganizerNavigation current="members" personal className="-mx-5" />
          }
        >
          {(selected, groups) => (
            <GroupRosterScreen
              key={`${accountId}:${selected.id}`}
              accountId={accountId}
              request={request}
              selected={selected}
              groups={groups}
            />
          )}
        </GroupBoundary>
      ) : mode === "mypage" ? (
        <>
          <Memberships accountId={accountId} request={request} />
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
        </>
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
          {view === "settlement" || view === "record" ? (
            <SettlementWorkspace
              accountId={accountId}
              eventId={eventId}
              request={request}
              record={view === "record"}
              startExpense={startExpense}
            />
          ) : view === "attendance" ? (
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
      ) : view === "records" ? (
        <RecordsList
          accountId={accountId}
          request={request}
          groupId={groupId}
          personal={personal}
        />
      ) : (
        <EventForm
          initialDate={initialDate}
          accountId={accountId}
          request={request}
          groupId={groupId ?? undefined}
        />
      )}
    </section>
  );
}
