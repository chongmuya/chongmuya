import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import type { Event } from "../features/events/types/event.types";
import type { EventSummary } from "../features/settlements/types";
import {
  featuredEvent,
  homeEventPath,
  homeAction,
  reservationLabel,
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
  scheduledAt: date,
});
const summary = (
  eventId: string,
  status: EventSummary["settlement"]["status"] = "EMPTY",
): EventSummary => ({
  eventId,
  participantCount: 0,
  roundCount: 0,
  attendingCount: 0,
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

test("date is not a completion fact; reservation-free attendance and settlement stay independent", () => {
  assert.equal(homeAction(undefined).view, undefined);
  const empty = summary("past");
  assert.equal(homeAction(empty).view, "attendance");
  assert.equal(reservationLabel(empty), "예약 미선택");
  assert.equal(
    homeAction({ ...empty, roundCount: 1, attendingCount: 0 }).view,
    "attendance",
  );
  assert.equal(homeAction(summary("past", "IN_PROGRESS")).view, "settlement");
  const done = summary("past", "COMPLETE");
  assert.equal(homeAction(done).view, "record");
  assert.equal(reservationLabel(done), "예약 미선택");
  const cancelled = {
    ...done,
    reservation: {
      reservationId: "r",
      status: "CANCELLED",
      progress: "REFUND_PENDING",
      restaurantName: null,
      startsAt: "2026-11-10T12:00:00Z",
    } as const,
  };
  assert.equal(reservationLabel(cancelled), "환불 확인 중");
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
  assert.equal(homeAction(due).action, "예약 확인하기");
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
