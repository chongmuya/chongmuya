"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth, AuthScreen } from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { GroupBoundary, GroupSettings } from "@/features/groups/client";
import { EventList, EventDetail } from "@/features/events/client";

type Mode = "events" | "mypage" | "onboarding";

export function WorkspaceScreen({ mode }: { mode: Mode }) {
  const { client, status, account } = useAuth();
  const params = useSearchParams();
  if (status !== "authenticated" || !account)
    return (
      <main>
        <AuthScreen />
      </main>
    );
  return (
    <main>
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

// Page composition only: groups owns selection/onboarding, events owns event data.
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
    <GroupBoundary
      accountId={accountId}
      request={request}
      groupId={groupId}
      onboarding={mode === "onboarding"}
    >
      {(selected, groups) => (
        <section>
          <nav>
            <Link href={`/events?group=${encodeURIComponent(selected.id)}`}>
              행사 목록
            </Link>
            <Link href={`/mypage?group=${encodeURIComponent(selected.id)}`}>
              마이페이지
            </Link>
          </nav>
          <h1>{selected.name}</h1>
          {mode === "mypage" ? (
            <GroupSettings
              accountId={accountId}
              request={request}
              selected={selected}
              groups={groups}
            />
          ) : eventId ? (
            <EventDetail
              accountId={accountId}
              request={request}
              groupId={selected.id}
              eventId={eventId}
            />
          ) : (
            <EventList
              accountId={accountId}
              request={request}
              groupId={selected.id}
            />
          )}
        </section>
      )}
    </GroupBoundary>
  );
}
