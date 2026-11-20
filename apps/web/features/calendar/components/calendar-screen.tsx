"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { reservationLabel } from "../lib/reservation-label";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { StepLayout } from "@/shared/ui/step-layout";
import { IconButton } from "@/shared/ui/icon-button";
import { useQuery } from "@tanstack/react-query";
import { useAuth, AuthScreen } from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { useGroups } from "@/features/groups/client";
import { NotificationBadge } from "@/features/notifications/client";
import { Button, buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { OwnerNavigation } from "@/shared/ui/owner-navigation";
import { OrganizerNavigation } from "@/shared/ui/organizer-navigation";
import { ReservationFacts } from "./reservation-facts";
import { Dialog } from "@/shared/ui/dialog";
import {
  calendarQuery,
  calendarStores,
  scheduleQuery,
} from "../api/calendar.api";
import { Calendar } from "@/shared/ui/calendar";
import { koreanDateOnly } from "@/shared/lib/korean-date";
import { ScheduleForm } from "./schedule-form";
import { usePageVisible } from "@/shared/hooks/use-page-visible";
export function CalendarScreen() {
  const { account, status, client } = useAuth(),
    params = useSearchParams();
  const request = useMemo(() => client.request.bind(client), [client]);
  return account && status === "authenticated" ? (
    <CalendarContent
      key={`${account.id}:${params.get("group")}:${params.get("restaurant")}`}
      accountId={account.id}
      owner={account.accountType === "owner"}
      request={request}
      groupId={params.get("group") ?? undefined}
      restaurantId={params.get("restaurant") ?? undefined}
      scheduleId={params.get("schedule") ?? undefined}
    />
  ) : (
    <AuthScreen />
  );
}
function CalendarContent({
  accountId,
  request,
  owner,
  groupId,
  restaurantId,
  scheduleId,
}: {
  accountId: string;
  request: SessionRequest;
  owner: boolean;
  groupId?: string;
  restaurantId?: string;
  scheduleId?: string;
}) {
  const router = useRouter();
  const today = koreanDateOnly();
  const visible = usePageVisible();
  const [month, setMonth] = useState(today.slice(0, 7)),
    [selected, setSelected] = useState(today),
    [adding, setAdding] = useState(false),
    [creating, setCreating] = useState(false);
  const stores = useQuery({
    ...calendarStores(accountId, request),
    enabled: owner,
  });
  const restaurant = restaurantId ?? stores.data?.restaurants[0]?.id;
  const groups = useGroups(accountId, request);
  const query = useQuery({
    ...calendarQuery(
      accountId,
      request,
      month,
      owner ? undefined : groupId,
      owner ? restaurant : undefined,
    ),
    enabled: (q) =>
      visible && (!owner || !!restaurant) && !isAccessError(q.state.error),
  });
  const detail = useQuery({
    ...scheduleQuery(accountId, request, scheduleId ?? "none"),
    enabled: !!scheduleId && !owner,
  });
  const data = isAccessError(query.error) ? undefined : query.data;
  const items = data
    ? [
        ...data.schedules.map((s) => ({
          id: s.id,
          date: s.date,
          order: s.startsAt ? Date.parse(s.startsAt) : -1,
          title: s.title,
          kind: "schedule" as const,
          reservation: undefined,
          status: s.startsAt
            ? new Date(s.startsAt).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "종일",
          href: `/calendar?schedule=${s.id}${groupId ? `&group=${groupId}` : ""}`,
        })),
        ...data.events.map((e) => ({
          id: e.id,
          date: koreanDateOnly(new Date(e.scheduledAt)),
          order: Date.parse(e.scheduledAt),
          title: e.name,
          kind: "event" as const,
          reservation: undefined,
          status: e.restaurantName ?? "매장 선택 전",
          href: `/events?event=${e.id}`,
        })),
        ...(data.reservations ?? []).map((r) => ({
          id: r.id,
          date: koreanDateOnly(new Date(r.startsAt)),
          order: Date.parse(r.startsAt),
          title: r.title,
          kind: "reservation" as const,
          reservation: r,
          status: reservationLabel(r),
          href: r.destination,
        })),
      ].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.order - b.order ||
          a.id.localeCompare(b.id),
      )
    : [];
  const returnGroup =
    detail.data && !isAccessError(detail.error) ? detail.data.groupId : groupId;
  const root = `/calendar${returnGroup ? `?group=${returnGroup}` : owner && restaurant ? `?restaurant=${restaurant}` : ""}`;
  const selectedItems = items.filter((item) => item.date === selected);
  if (!owner && (scheduleId || creating)) {
    return (
      <StepLayout
        title={scheduleId ? "일정 수정" : "일정 추가"}
        onBack={() => (scheduleId ? router.push(root) : setCreating(false))}
      >
        {scheduleId ? (
          <>
            {detail.isError && (
              <ErrorState retry={() => void detail.refetch()}>
                일정을 확인할 수 없어요. 삭제되었거나 권한이 변경됐을 수 있어요.
              </ErrorState>
            )}
            {detail.data && !isAccessError(detail.error) ? (
              <ScheduleForm
                key={scheduleId}
                accountId={accountId}
                request={request}
                date={selected}
                initial={detail.data}
                onRefresh={() => void detail.refetch()}
                onDone={() => router.push(root)}
              />
            ) : (
              !detail.isError && <LoadingState>불러오는 중…</LoadingState>
            )}
          </>
        ) : (
          <ScheduleForm
            accountId={accountId}
            request={request}
            groupId={groupId}
            date={selected}
            onRefresh={() => {}}
            onDone={() => setCreating(false)}
          />
        )}
      </StepLayout>
    );
  }
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[402px] flex-col px-5 pt-[max(clamp(24px,7.7svh,73px),env(safe-area-inset-top))]">
      <header className="mb-[30px] flex min-h-11 items-center justify-between gap-3">
        <label className="relative min-w-0 max-w-[calc(100%-106px)]">
          <span className="sr-only">{owner ? "매장" : "일정 범위"}</span>
          <select
            className={cn(
              "min-h-11 max-w-full appearance-none truncate rounded-control bg-transparent py-2 pl-1 pr-6 text-base font-medium",
              owner && "text-xl font-semibold",
            )}
            value={owner ? (restaurant ?? "") : (returnGroup ?? "")}
            onChange={(e) =>
              router.push(
                `/calendar${e.target.value ? `?${owner ? "restaurant" : "group"}=${e.target.value}` : ""}`,
              )
            }
          >
            {owner ? (
              stores.data?.restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))
            ) : (
              <>
                <option value="">개인 일정</option>
                {groups.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </>
            )}
          </select>
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2">
            <Image
              style={{ height: "auto" }}
              src="/images/calendar/scope-arrow.svg"
              width={6.59099}
              height={11.0607}
              className="-rotate-90"
              alt=""
            />
          </span>
        </label>
        <div className="-mr-1 flex shrink-0 items-center gap-1.5">
          <NotificationBadge accountId={accountId} request={request} icon />
          <IconButton href="/mypage" aria-label="내 정보">
            <Image
              style={{ height: "auto" }}
              src="/images/calendar/profile.svg"
              width={36}
              height={36}
              alt=""
            />
          </IconButton>
        </div>
      </header>
      {(owner ? stores.isError : groups.isError) && (
        <ErrorState
          retry={() => void (owner ? stores.refetch() : groups.refetch())}
        >
          선택 목록을 불러오지 못했어요.
        </ErrorState>
      )}
      {owner && stores.data?.restaurants.length === 0 ? (
        <Link href="/owner/register">매장 등록하기</Link>
      ) : (
        <>
          {query.isError && <ErrorState retry={() => void query.refetch()} />}
          {query.isPending && (!owner || restaurant) && (
            <LoadingState>불러오는 중…</LoadingState>
          )}
          <Calendar
            showYear={false}
            value={selected}
            month={month}
            markedDates={items.map((i) => i.date)}
            onMonthChange={(m) => {
              setMonth(m);
              setSelected(`${m}-01`);
            }}
            onChange={(date) => {
              setSelected(date);
              setMonth(date.slice(0, 7));
            }}
          />
          <div className="mt-[18px] mb-3.5 flex min-h-11 items-center justify-between gap-2">
            <h2 className="text-xl leading-6 font-semibold">
              {new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date(`${selected}T00:00:00+09:00`))}
              <span className="ml-2 text-sm text-brand">
                {selectedItems.length}
              </span>
            </h2>
            {!owner && (
              <Button
                variant="outline"
                className="gap-2 rounded-control border-placeholder px-3 text-sm text-secondary"
                onClick={() => setAdding(true)}
              >
                <Image
                  style={{ height: "auto" }}
                  src="/images/calendar/add.svg"
                  width={13}
                  height={13}
                  alt=""
                />
                일정 추가
              </Button>
            )}
          </div>
          {data && selectedItems.length === 0 && (
            <div className="py-16 text-center">
              <h3 className="text-xl font-bold">아직 등록된 일정이 없어요</h3>
              <p className="mt-3 text-sm text-muted">
                {owner
                  ? "총무야 문의·예약이 여기에 표시돼요."
                  : "새로운 일정을 추가해 볼까요?"}
              </p>
            </div>
          )}
          <div className="mb-8 space-y-3.5">
            {selectedItems.map((i) => (
              <Link
                key={i.id}
                href={i.href}
                className={cn(
                  "flex min-w-0 items-center gap-4 px-4 py-4",
                  owner
                    ? "rounded-card bg-surface shadow-card"
                    : "rounded-control",
                )}
              >
                {!owner && (
                  <span className="flex w-[30px] shrink-0 items-center justify-center">
                    <Image
                      style={{ height: "auto" }}
                      src={
                        i.kind === "event"
                          ? "/images/calendar/event.svg"
                          : "/images/restaurants/date.svg"
                      }
                      width={i.kind === "event" ? 30 : 18}
                      height={i.kind === "event" ? 30.9712 : 18}
                      alt=""
                    />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {i.reservation && (
                    <p className="mb-2 text-base font-medium text-brand">
                      {new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "numeric",
                        day: "numeric",
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      }).format(new Date(i.reservation.startsAt))}
                    </p>
                  )}
                  <strong className="block text-base font-medium break-words leading-5">
                    {i.title}
                  </strong>
                  <span className="mt-2 block text-xs text-secondary">
                    {i.status}
                  </span>
                  {i.reservation && (
                    <ReservationFacts reservation={i.reservation} />
                  )}
                </div>
                <Image
                  style={{ height: "auto" }}
                  src="/images/calendar/next.svg"
                  width={10.4142}
                  height={18}
                  alt=""
                  className="shrink-0 rotate-180"
                />
              </Link>
            ))}
          </div>
        </>
      )}
      {adding && (
        <Dialog
          labelledBy="calendar-add-title"
          showCloseButton
          onClose={() => setAdding(false)}
        >
          <div className="space-y-4">
            <h2 id="calendar-add-title" className="text-xl font-bold">
              어떤 일정을 추가할까요?
            </h2>
            <Link
              className={buttonStyles({ className: "w-full" })}
              href={`/events?date=${selected}${groupId ? `&group=${groupId}` : ""}`}
            >
              행사 일정 추가
            </Link>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setCreating(true);
              }}
            >
              기타 일정 추가
            </Button>
          </div>
        </Dialog>
      )}
      {owner ? (
        <OwnerNavigation current="calendar" restaurantId={restaurant} />
      ) : (
        <OrganizerNavigation
          current="calendar"
          groupId={groupId}
          personal={!groupId}
          className="-mx-5"
        />
      )}
    </main>
  );
}
