import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import type { Event } from "../features/events/types/event.types";
import type { EventSummary } from "../features/settlements/types";
import {
  featuredEvent,
  homeEventPath,
  homeAction,
  homeActionPath,
  reservationLabel,
  settlementLabel,
} from "../features/events/lib/home-event";
import { eventSummariesQuery } from "../features/settlements/api/event-summaries.api";
import { recordsQuery } from "../features/settlements/api/records.api";
import { safeReturnPath } from "../features/auth/lib/return-path";
import type { SessionRequest } from "../features/auth/types";

const now = Date.parse("2026-11-20T12:00:00Z");
const event = (id: string, date: string | null): Event => ({
  id,
  name: id,
  ownerId: "a",
  groupId: null,
  version: 1,
  expectedGuests: null,
  scheduledAt: date,
});
const summary = (
  eventId: string,
  status: EventSummary["settlement"]["status"] = "EMPTY",
): EventSummary => ({
  eventId,
  finalizedAt: null,
  participantCount: 0,
  roundCount: 0,
  attendingCount: 0,
  hasAttendanceRecords: false,
  attendanceComplete: false,
  expectedGuests: null,
  region: null,
  inquiry: null,
  reservation: null,
  settlement: {
    status,
    total: 0,
    target: 0,
    confirmed: 0,
    unconfirmed: 0,
    drafts: 0,
    differences: 0,
    needsReview: false,
  },
});

test("home preserves an explicit event; otherwise uses outstanding past work and nearest schedule, not creation order", () => {
  const past = event("past", "2026-11-10T12:00:00Z"),
    near = event("near", "2026-11-21T12:00:00Z"),
    far = event("far", "2026-12-01T12:00:00Z");
  const list = [far, past, near];
  assert.equal(featuredEvent(list, [], null, now)?.id, "near");
  assert.equal(
    featuredEvent(list, [summary("past", "IN_PROGRESS")], null, now)?.id,
    "past",
  );
  assert.equal(
    featuredEvent(list, [summary("past", "IN_PROGRESS")], "far", now)?.id,
    "far",
  );
  assert.equal(featuredEvent(list, [], "other-account-event", now)?.id, "near");
  assert.equal(
    featuredEvent([event("b", null), event("a", null)], [], null, now)?.id,
    "a",
  );
});

test("a new event opens the actual inquiry workspace and an unknown summary does not show a new or finished event", () => {
  const e = event("past", "2026-11-10T12:00:00Z");
  assert.equal(homeAction(e).view, undefined);
  assert.equal(homeAction(e).completed, undefined);
  const empty = summary("past");
  const next = homeAction(e, empty, now);
  assert.equal(next.view, "reservation");
  assert.equal(next.title, "행사에 딱 맞는\n식당을 찾아볼까요?");
  assert.equal(
    homeActionPath(e, empty, next),
    "/restaurants?event=past&inquiry=1&view=conditions",
  );
  const planned = { ...e, expectedGuests: 24 };
  assert.equal(
    homeAction(planned, { ...empty, roundCount: 1 }, now).view,
    "reservation",
  );
  assert.equal(reservationLabel(empty), "예약 미선택");
});

test("first expense starts on the next Korean calendar day, including an event without a booking", () => {
  const e = event("event", "2026-11-20T04:00:00Z");
  const withoutBooking = {
    ...summary(e.id),
    roundCount: 1,
    hasAttendanceRecords: true,
  };
  const confirmed: EventSummary = {
    ...summary(e.id),
    reservation: {
      reservationId: "booking",
      status: "CONFIRMED",
      progress: "CONFIRMED",
      restaurantName: null,
      startsAt: e.scheduledAt!,
    },
  };
  const beforeMidnight = Date.parse("2026-11-20T14:59:59Z");
  const midnight = Date.parse("2026-11-20T15:00:00Z");
  for (const facts of [withoutBooking, confirmed]) {
    assert.equal(homeAction(e, facts, beforeMidnight).view, "attendance");
    const next = homeAction(e, facts, midnight);
    assert.equal(next.action, "이제 정산을 시작해볼까요?");
    assert.equal(
      homeActionPath(e, facts, next),
      "/events?event=event&view=settlement&scope=personal&action=expense",
    );
    assert.equal(facts.settlement.status, "EMPTY");
  }
  assert.equal(
    homeAction(e, { ...withoutBooking, hasAttendanceRecords: false }, midnight)
      .view,
    "attendance",
  );
});

test("settlement and records work promote the second past card without reordering the event list", () => {
  const next = event("next", "2026-11-21T12:00:00Z");
  const past = event("past", "2026-11-10T12:00:00Z");
  const events = [next, past];
  for (const facts of [
    { ...summary(past.id), roundCount: 1, hasAttendanceRecords: true },
    summary(past.id, "IN_PROGRESS"),
    summary(past.id, "COMPLETE"),
  ]) {
    assert.equal(featuredEvent(events, [facts], null, now), past);
    assert.deepEqual(events, [next, past]);
  }
});

test("a saved finalization survives a fresh summary and reopened work takes priority", () => {
  const past = event("past", "2026-11-10T12:00:00Z");
  const done = summary(past.id, "COMPLETE");
  assert.equal(homeAction(past, done, now).view, "record");
  assert.equal(reservationLabel(done), "예약 미선택");
  const saved = { ...done, finalizedAt: "2026-11-15T05:00:00Z" };
  const restored = JSON.parse(JSON.stringify(saved)) as EventSummary;
  const final = homeAction(past, restored, now);
  assert.equal(final.completed, true);
  assert.equal(final.title, "이번 행사도 수고했어요!\n다음에도 함께해요.");
  assert.equal(
    homeAction(
      past,
      {
        ...restored,
        settlement: { ...restored.settlement, status: "IN_PROGRESS" },
      },
      now,
    ).view,
    "settlement",
  );
  assert.equal(
    homeAction(
      past,
      {
        ...restored,
        settlement: { ...restored.settlement, needsReview: true },
      },
      now,
    ).view,
    "settlement",
  );
  const review = {
    ...restored,
    settlement: { ...restored.settlement, needsReview: true },
  };
  assert.equal(settlementLabel(review), "정산 재확인 필요");
  assert.equal(homeAction(past, review, now).action, "연결 지출 확인하기");
  assert.equal(
    reservationLabel({
      ...restored,
      reservation: {
        reservationId: "r",
        status: "CANCELLED",
        progress: "CANCELLED",
        restaurantName: null,
        startsAt: past.scheduledAt!,
      },
    }),
    "예약 취소 완료",
  );
  const next = event("next", null);
  assert.equal(featuredEvent([past, next], [restored], null, now), next);
  assert.equal(featuredEvent([past, next], [restored], past.id, now), past);
  assert.equal(featuredEvent([past], [restored], null, now), past);
  assert.equal(featuredEvent([], [], null, now), undefined);
  assert.equal(
    homeAction(
      past,
      {
        ...restored,
        reservation: {
          reservationId: "r",
          status: "CANCELLED",
          progress: "REFUND_PENDING",
          restaurantName: null,
          startsAt: past.scheduledAt!,
        },
      },
      now,
    ).action,
    "환불 확인 중",
  );
});

test("home summaries use bounded batch endpoints with account-scoped keys, without full settlement requests", async () => {
  const paths: string[] = [];
  const request: SessionRequest = async <T>(path: string) => {
    paths.push(path);
    return [] as T;
  };
  const ids = Array.from({ length: 205 }, (_, i) => String(i).padStart(3, "0"));
  const a = eventSummariesQuery({
    accountId: "a",
    eventIds: [...ids, ids[0]!],
    request,
  });
  const b = eventSummariesQuery({ accountId: "b", eventIds: ids, request });
  assert.notDeepEqual(a.queryKey, b.queryKey);
  const cache = new QueryClient();
  try {
    await cache.fetchQuery(a);
  } finally {
    cache.clear();
  }
  assert.equal(paths.length, 3);
  const actual = paths.flatMap((path) => {
    assert(path.startsWith("/api/v1/settlements/summaries?"));
    const batch = new URL(path, "http://localhost").searchParams
      .get("eventIds")!
      .split(",");
    assert(batch.length <= 100);
    return batch;
  });
  assert.deepEqual(actual, ids);
});

test("a deadline can require review before another reservation write updates the saved status", () => {
  const past = event("past", "2026-11-10T12:00:00Z");
  const due: EventSummary = {
    ...summary(past.id),
    reservation: {
      reservationId: "reservation",
      status: "PREPARING",
      progress: "CHECK_REQUIRED",
      restaurantName: null,
      startsAt: past.scheduledAt!,
    },
  };
  assert.equal(reservationLabel(due), "예약 확인 필요");
  assert.equal(homeAction(past, due, now).action, "예약 확인하기");
  assert.equal(
    featuredEvent(
      [event("future", "2026-11-21T12:00:00Z"), past],
      [due],
      null,
      now,
    )?.id,
    past.id,
  );
});

test("home and roster return paths preserve only valid selected resource identifiers", () => {
  const group = "00000000-0000-4000-8000-000000000001",
    id = "00000000-0000-4000-8000-000000000002";
  assert.equal(
    safeReturnPath(`/?group=${group}&event=${id}&next=https://outside.test`),
    `/?group=${group}&event=${id}`,
  );
  assert.equal(
    safeReturnPath(`/?view=personal&event=${id}`),
    `/?event=${id}&view=personal`,
  );
  assert.equal(
    safeReturnPath(`/?event=invalid&view=personal`),
    "/?view=personal",
  );
  assert.equal(
    safeReturnPath(`/mypage?group=${group}&view=roster`),
    `/mypage?group=${group}&view=roster`,
  );
  assert.equal(
    safeReturnPath("/events?scope=personal"),
    "/events?scope=personal",
  );
  assert.equal(
    safeReturnPath("/events?view=records&scope=personal"),
    "/events?view=records&scope=personal",
  );
  assert.equal(
    homeEventPath(event(id, null), "attendance"),
    `/events?event=${id}&view=attendance&scope=personal`,
  );
  assert.equal(
    homeEventPath({ ...event(id, null), groupId: group }, "settlement"),
    `/events?event=${id}&view=settlement&group=${group}`,
  );
  assert.equal(
    safeReturnPath(homeEventPath(event(id, null), "attendance")),
    `/events?event=${id}&view=attendance&scope=personal`,
  );
  assert.match(
    safeReturnPath(`/events?event=${id}&view=settlement&action=expense`),
    /action=expense/,
  );
  assert.doesNotMatch(
    safeReturnPath(`/events?event=${id}&view=record&action=expense`),
    /action=expense/,
  );
});

test("personal records retain a separate cache and query scope from all and group records", async () => {
  const paths: string[] = [];
  const request: SessionRequest = async <T>(path: string) => {
    paths.push(path);
    return { count: 0, events: [] } as T;
  };
  const filter = { search: "", after: "", before: "", offset: 0 };
  const cache = new QueryClient();
  try {
    await cache.fetchQuery(recordsQuery("a", request, null, filter));
    await cache.fetchQuery(recordsQuery("a", request, null, filter, true));
    await cache.fetchQuery(recordsQuery("a", request, "group", filter, true));
    assert.equal(
      new URL(paths[0]!, "http://localhost").searchParams.get("scope"),
      null,
    );
    assert.equal(
      new URL(paths[1]!, "http://localhost").searchParams.get("scope"),
      "personal",
    );
    const group = new URL(paths[2]!, "http://localhost").searchParams;
    assert.equal(group.get("groupId"), "group");
    assert.equal(group.get("scope"), null);
  } finally {
    cache.clear();
  }
});
