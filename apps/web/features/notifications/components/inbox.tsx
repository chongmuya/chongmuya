"use client";
import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, AuthScreen } from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { StepLayout } from "@/shared/ui/step-layout";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { isAccessError } from "@/shared/http/access-error";
import { inboxKey, readInbox, unreadQuery } from "../api/notifications.api";
import { useInbox } from "../hooks/use-inbox";
import { notificationDestination } from "../lib/destination";
import { cn } from "@/shared/lib/cn";
export function NotificationBadge({
  accountId,
  request,
  icon = true,
}: {
  accountId: string;
  request: SessionRequest;
  icon?: boolean;
}) {
  const q = useQuery({ ...unreadQuery(accountId, request), enabled: false });
  return (
    <Link
      href="/notifications"
      className={cn(
        "relative flex min-h-11 min-w-11 items-center justify-center rounded-full",
        !icon && "bg-brand px-3 text-white",
      )}
      aria-label={`알림${q.data && !isAccessError(q.error) ? ` 미읽음 ${q.data.unread}개` : ""}`}
    >
      {icon ? (
        <Image
          src="/images/calendar/notification.svg"
          width={36}
          height={36}
          alt=""
        />
      ) : (
        "알림"
      )}
      {q.data &&
        !isAccessError(q.error) &&
        q.data.unread > 0 &&
        (icon ? (
          <span className="absolute top-0 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-surface px-1 text-[10px] font-semibold text-brand">
            {q.data.unread > 99 ? "99+" : q.data.unread}
          </span>
        ) : (
          ` ${q.data.unread}`
        ))}
    </Link>
  );
}
export function InboxScreen() {
  const { account, status, client } = useAuth();
  const request = useMemo(() => client.request.bind(client), [client]);
  return status === "authenticated" && account ? (
    <InboxContent key={account.id} accountId={account.id} request={request} />
  ) : (
    <AuthScreen returnPath="/notifications" />
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
  const latest = useInbox(accountId, request);
  const history = useInbox(accountId, request, before, false, !!before, false);
  const q = before ? history : latest;
  const cache = useQueryClient(),
    active = useActiveScreen(),
    router = useRouter();
  const read = useMutation({
    mutationFn: (input: { id: string; destination?: string }) =>
      readInbox(request, input.id),
    onSuccess: async (_, input) => {
      if (!active.current) return;
      await cache.invalidateQueries({ queryKey: inboxKey(accountId) });
      if (active.current && input.destination) router.push(input.destination);
    },
    retry: false,
  });
  const data =
    isAccessError(q.error) || isAccessError(read.error) ? undefined : q.data;
  return (
    <StepLayout title="알림" onBack={() => router.push("/")}>
      {data && (
        <p className="sr-only" aria-live="polite">
          미읽음 {latest.data?.unread ?? data.unread}개
        </p>
      )}
      <div className={cn("space-y-4", !!data?.items.length && "pt-2")}>
        {q.isError && (
          <ErrorState retry={() => void q.refetch()}>
            알림을 불러오지 못했어요.
          </ErrorState>
        )}
        {read.isError &&
          (isAccessError(read.error) ? (
            <ErrorState
              retry={() => {
                read.reset();
                void q.refetch();
              }}
            >
              알림을 확인할 수 없어요. 다시 확인해 주세요.
            </ErrorState>
          ) : (
            <p role="alert">
              읽음 처리 결과를 확인하지 못했어요. 다시 눌러 확인해 주세요.
            </p>
          ))}
        {data ? (
          <>
            {data.items.length === 0 ? (
              <div className="flex flex-col items-center gap-5 pt-[88px] pb-16 text-center">
                <Image
                  src="/images/notifications/empty.svg"
                  width={41.5002}
                  height={46.111}
                  alt=""
                />
                <div>
                  <h2 className="text-xl font-semibold">
                    {before ? "이전 알림이 없어요" : "새 알림이 없어요"}
                  </h2>
                  <p className="mt-2 text-xs leading-normal text-muted">
                    예약 응답·입금·정산 소식이 생기면 여기로 알려드려요.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="-ml-0.5 w-full max-w-[361px] space-y-4">
                {data.items.map((item) => {
                  const destination = notificationDestination(item.destination);
                  const icon = notificationIcon(item.fact);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-4 rounded-control px-5 py-4 text-left shadow-card disabled:cursor-wait",
                          item.readAt ? "bg-surface" : "bg-choice",
                        )}
                        disabled={read.isPending}
                        onClick={() =>
                          read.mutate({
                            id: item.id,
                            destination: destination ?? undefined,
                          })
                        }
                      >
                        <span
                          className="flex size-7 shrink-0 items-center justify-center"
                          aria-hidden="true"
                        >
                          <Image
                            src={`/images/notifications/${icon.name}.svg`}
                            width={icon.width}
                            height={icon.height}
                            alt=""
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base leading-[1.2] font-medium break-words text-copy">
                            {item.title}
                          </span>
                          <span className="mt-2 block text-xs leading-[1.2] break-words text-secondary">
                            {item.summary}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-[1.2] text-muted">
                            {!item.readAt && (
                              <span className="sr-only">미읽음</span>
                            )}
                            <time dateTime={item.createdAt}>
                              {new Intl.DateTimeFormat("ko-KR", {
                                timeZone: "Asia/Seoul",
                                dateStyle: "medium",
                              }).format(new Date(item.createdAt))}
                            </time>
                            {!destination && <span>읽음으로 표시</span>}
                          </span>
                        </span>
                        {destination && (
                          <Image
                            src="/images/notifications/next.svg"
                            width={10.0879}
                            height={15.75}
                            alt=""
                            className="shrink-0 rotate-180"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          !q.isError &&
          !isAccessError(read.error) && (
            <LoadingState>불러오는 중…</LoadingState>
          )
        )}
        <div className="flex gap-3">
          {before && (
            <Button variant="outline" onClick={() => setBefore(undefined)}>
              최신 알림
            </Button>
          )}
          {data?.next && (
            <Button onClick={() => setBefore(data.next!)}>이전 알림</Button>
          )}
        </div>
      </div>
    </StepLayout>
  );
}

// One account-scoped observer survives route changes; badges only subscribe to its cache.
export function NotificationObserver() {
  const { account, status, client } = useAuth();
  const request = useMemo(() => client.request.bind(client), [client]);
  return status === "authenticated" && account ? (
    <UnreadObserver key={account.id} id={account.id} request={request} />
  ) : null;
}
function UnreadObserver({
  id,
  request,
}: {
  id: string;
  request: SessionRequest;
}) {
  useInbox(id, request, undefined, true);
  return null;
}

function notificationIcon(fact: { kind: string; category: string }) {
  if (
    ["SETTLEMENT_COMPLETED", "MEMBERS_ADDED", "FILE_REGISTERED"].includes(
      fact.kind,
    )
  )
    return { name: "complete", width: 29.5, height: 29.5 };
  if (fact.category === "RESERVATION")
    return { name: "attention", width: 27, height: 27 };
  if (fact.category === "SETTLEMENT")
    return { name: "payment", width: 28.75, height: 28 };
  return { name: "schedule", width: 28, height: 28 };
}
