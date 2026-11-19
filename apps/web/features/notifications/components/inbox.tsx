"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, AuthScreen } from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { isAccessError } from "@/shared/http/access-error";
import { inboxKey, readInbox } from "../api/notifications.api";
import { useInbox } from "../hooks/use-inbox";
import { notificationDestination } from "../lib/destination";
export function NotificationBadge({
  accountId,
  request,
}: {
  accountId: string;
  request: SessionRequest;
}) {
  const q = useInbox(accountId, request, undefined, true);
  return (
    <Link
      href="/notifications"
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand-action px-3 text-white"
      aria-label={`알림${q.data && !isAccessError(q.error) ? ` 미읽음 ${q.data.unread}개` : ""}`}
    >
      알림
      {q.data && !isAccessError(q.error) && q.data.unread > 0
        ? ` ${q.data.unread}`
        : ""}
    </Link>
  );
}
export function InboxScreen() {
  const { account, status, client } = useAuth();
  const request = useMemo(() => client.request.bind(client), [client]);
  return status === "authenticated" && account ? (
    <InboxContent key={account.id} accountId={account.id} request={request} />
  ) : (
    <AuthScreen />
  );
}
function InboxContent({
  accountId,
  request,
}: {
  accountId: string;
  request: SessionRequest;
}) {
  const [before, setBefore] = useState<string>();
  const q = useInbox(accountId, request, before),
    latest = useInbox(accountId, request);
  const cache = useQueryClient(),
    active = useActiveScreen(),
    router = useRouter();
  const read = useMutation({
    mutationFn: (input: {
      id?: string;
      through?: string;
      destination?: string;
    }) =>
      readInbox(
        request,
        input.id ? { id: input.id } : { through: input.through },
      ),
    onSuccess: async (_, input) => {
      if (!active.current) return;
      await cache.invalidateQueries({ queryKey: inboxKey(accountId) });
      if (active.current && input.destination) router.push(input.destination);
    },
    retry: false,
  });
  const data = isAccessError(q.error) ? undefined : q.data;
  return (
    <StepLayout title="알림" onBack={() => router.push("/")}>
      <div className="space-y-4">
        {q.isError && (
          <ErrorState retry={() => void q.refetch()}>
            알림을 불러오지 못했어요.
          </ErrorState>
        )}
        {read.isError && (
          <p role="alert">
            읽음 처리 결과를 확인하지 못했어요. 다시 눌러 확인해 주세요.
          </p>
        )}
        {data ? (
          <>
            <div className="flex justify-between">
              <p>미읽음 {latest.data?.unread ?? data.unread}개</p>
              <Button
                variant="outline"
                disabled={read.isPending}
                onClick={() =>
                  read.mutate({ through: latest.data?.through ?? data.through })
                }
              >
                전체 읽음
              </Button>
            </div>
            {data.items.length === 0 ? (
              <div className="py-24 text-center">
                <h2 className="text-xl font-bold">새 알림이 없어요</h2>
                <p className="mt-3 text-sm text-muted">
                  예약·정산·일정 소식이 생기면 여기로 알려드려요.
                </p>
              </div>
            ) : (
              data.items.map((item) => {
                const destination = notificationDestination(item.destination);
                return (
                  <article
                    key={item.id}
                    className={`rounded-control p-5 shadow-card ${item.readAt ? "bg-surface" : "bg-choice"}`}
                  >
                    <Button
                      variant="outline"
                      className="h-auto w-full border-0 p-0 text-left"
                      disabled={read.isPending}
                      onClick={() =>
                        read.mutate({
                          id: item.id,
                          destination: destination ?? undefined,
                        })
                      }
                    >
                      <span>
                        <strong className="block">{item.title}</strong>
                        <span className="mt-2 block text-xs">
                          {item.summary}
                        </span>
                        <time className="mt-2 block text-xs text-muted">
                          {new Intl.DateTimeFormat("ko-KR", {
                            timeZone: "Asia/Seoul",
                            dateStyle: "medium",
                          }).format(new Date(item.createdAt))}
                        </time>
                      </span>
                    </Button>
                    {!destination && (
                      <p className="mt-2 text-xs">
                        이 알림의 이동 경로를 확인할 수 없어요.
                      </p>
                    )}
                  </article>
                );
              })
            )}
            <div className="flex gap-3">
              {before && (
                <Button variant="outline" onClick={() => setBefore(undefined)}>
                  최신 알림
                </Button>
              )}
              {data.next && (
                <Button onClick={() => setBefore(data.next!)}>이전 알림</Button>
              )}
            </div>
          </>
        ) : (
          !q.isError && <LoadingState>불러오는 중…</LoadingState>
        )}
      </div>
    </StepLayout>
  );
}
