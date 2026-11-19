"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth, AuthScreen } from "@/features/auth/client";
import type { SessionRequest } from "@/features/auth/types";
import { useGroups } from "@/features/groups/client";
import { NotificationBadge } from "@/features/notifications/client";
import { Button, buttonStyles } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { isAccessError } from "@/shared/http/access-error";
import { Dialog } from "@/shared/ui/dialog";
import {
  calendarQuery,
  calendarStores,
  scheduleQuery,
} from "../api/calendar.api";
import { kstDate, monthDays, moveMonth } from "../lib/dates";
import { ScheduleForm } from "./schedule-form";
export function CalendarScreen() {
  const { account, status, client } = useAuth(),
    params = useSearchParams();
  const request = useMemo(() => client.request.bind(client), [client]);
  return account && status === "authenticated" ? (
    <CalendarContent
      key={`${account.id}:${params.get("group")}:${params.get("restaurant")}:${params.get("schedule")}`}
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
  const today = kstDate();
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
    enabled: !owner || !!restaurant,
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
          date: kstDate(new Date(e.scheduledAt)),
          order: Date.parse(e.scheduledAt),
          title: e.name,
          status: "행사",
          href: `/events?event=${e.id}`,
        })),
        ...(data.reservations ?? []).map((r) => ({
          id: r.id,
          date: kstDate(new Date(r.startsAt)),
          order: Date.parse(r.startsAt),
          title: r.title,
          status:
            (
              {
                PREPARING: "선택됨 · 준비 중",
                CONFIRMED: "확정",
                CANCELLED: "취소",
                CHECK_REQUIRED: "확인 필요",
                OFFERED: "가능 제안 · 선택 기한까지 자리 확보",
                INQUIRY: "문의",
                EXPIRED: "제안 만료",
                OTHER_SELECTED: "후보 종료",
                MERCHANT_DECLINED: "불가",
                ORGANIZER_DECLINED: "제안 거절",
                OPERATOR_CLOSED: "종료",
                SELECTED: "선택됨",
                OPEN: "문의",
              } as Record<string, string>
            )[r.status] ?? "종료",
          href: r.destination,
        })),
      ].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.order - b.order ||
          a.id.localeCompare(b.id),
      )
    : [];
  const root = `/calendar${groupId ? `?group=${groupId}` : owner && restaurant ? `?restaurant=${restaurant}` : ""}`;
  return (
    <main className="mx-auto flex min-h-svh max-w-[402px] flex-col px-5 pt-12">
      <header className="mb-8 flex items-center justify-between gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{owner ? "매장" : "일정 범위"}</span>
          <select
            className="w-full rounded-control bg-surface p-3"
            value={owner ? (restaurant ?? "") : (groupId ?? "")}
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
        </label>
        <NotificationBadge accountId={accountId} request={request} />
        <Link href="/mypage">내 정보</Link>
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
      ) : scheduleId && !owner ? (
        <>
          {detail.isError && (
            <ErrorState retry={() => void detail.refetch()}>
              일정을 확인할 수 없어요. 삭제되었거나 권한이 변경됐을 수 있어요.
            </ErrorState>
          )}
          {detail.data && !isAccessError(detail.error) ? (
            <ScheduleForm
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
          <Link href={root}>월력으로 돌아가기</Link>
        </>
      ) : creating ? (
        <ScheduleForm
          accountId={accountId}
          request={request}
          groupId={groupId}
          date={selected}
          onRefresh={() => {}}
          onDone={() => setCreating(false)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              aria-label="이전 달"
              onClick={() => {
                const m = moveMonth(month, -1);
                setMonth(m);
                setSelected(`${m}-01`);
              }}
            >
              ‹
            </Button>
            <h1 className="text-xl font-bold">{month.replace("-", "년 ")}월</h1>
            <Button
              variant="outline"
              aria-label="다음 달"
              onClick={() => {
                const m = moveMonth(month, 1);
                setMonth(m);
                setSelected(`${m}-01`);
              }}
            >
              ›
            </Button>
          </div>
          <Button
            variant="outline"
            className="my-3 self-start"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            오늘
          </Button>
          {query.isError && <ErrorState retry={() => void query.refetch()} />}
          {query.isPending && (!owner || restaurant) && (
            <LoadingState>불러오는 중…</LoadingState>
          )}
          <div className="grid grid-cols-7 text-center" aria-label="월력">
            {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
              <span key={day} className="py-2 text-xs text-muted">
                {day}
              </span>
            ))}
            {monthDays(month).map((date) => (
              <button
                type="button"
                key={date}
                aria-label={`${date}${items.some((i) => i.date === date) ? " 일정 있음" : ""}`}
                aria-pressed={date === selected}
                onClick={() => {
                  setSelected(date);
                  if (!date.startsWith(month)) setMonth(date.slice(0, 7));
                }}
                className={`relative min-h-12 rounded-full ${date === selected ? "border border-brand-action text-brand-action" : ""} ${date.startsWith(month) ? "" : "text-muted"}`}
              >
                {Number(date.slice(8))}
                {items.some((i) => i.date === date) && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 left-1/2 size-1 rounded-full bg-brand-action"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="my-6 flex items-center justify-between">
            <h2 className="text-lg font-bold">{selected}</h2>
            {!owner && (
              <Button variant="outline" onClick={() => setAdding(true)}>
                일정 추가
              </Button>
            )}
          </div>
          {data && items.filter((i) => i.date === selected).length === 0 && (
            <div className="py-16 text-center">
              <h3 className="text-xl font-bold">아직 등록된 일정이 없어요</h3>
              <p className="mt-3 text-sm text-muted">
                {owner
                  ? "총무야 문의·예약이 여기에 표시돼요."
                  : "새로운 일정을 추가해 볼까요?"}
              </p>
            </div>
          )}
          {items
            .filter((i) => i.date === selected)
            .map((i) => (
              <Link
                key={i.id}
                href={i.href}
                className="mb-4 rounded-control bg-surface p-5 shadow-card"
              >
                <strong className="block">{i.title}</strong>
                <span className="mt-2 block text-sm text-secondary">
                  {i.status}
                </span>
              </Link>
            ))}
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
              href={`/events${groupId ? `?group=${groupId}` : ""}`}
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
      <nav
        aria-label="주요 메뉴"
        className="sticky bottom-0 mt-auto grid grid-cols-4 gap-2 bg-surface py-5 text-center text-xs"
      >
        <Link
          href={
            owner
              ? "/owner"
              : groupId
                ? `/?group=${groupId}`
                : "/?view=personal"
          }
        >
          홈
        </Link>
        <Link href={root} aria-current="page">
          캘린더
        </Link>
        <Link
          href={
            owner
              ? "/owner"
              : groupId
                ? `/mypage?view=groups&group=${groupId}`
                : "/mypage?view=groups"
          }
        >
          {owner ? "매장관리" : "모임명단"}
        </Link>
        <Link
          href={
            owner
              ? "/owner/reservations"
              : `/events?view=records${groupId ? `&group=${groupId}` : ""}`
          }
        >
          {owner ? "예약관리" : "모임기록"}
        </Link>
      </nav>
    </main>
  );
}
