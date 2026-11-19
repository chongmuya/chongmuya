import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startResourceApplication } from "../support/resource-application.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";
import { CalendarService } from "../../src/modules/calendar/calendar.service.js";
import { RemindersService } from "../../src/modules/calendar/reminders.service.js";
import { CalendarSchedule } from "../../src/modules/calendar/entities/calendar-schedule.entity.js";
import { PhoneChange } from "../../src/modules/auth/entities/phone-change.entity.js";
import { OctomoService } from "../../src/modules/auth/octomo.service.js";
import { AuthSession } from "../../src/modules/auth/entities/auth-session.entity.js";
import type { NotificationInput } from "../../src/modules/notifications/types/notification.js";
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};
test("calendar ownership, retry, reminder concurrency/restart, settings and inbox snapshot races", async (t) => {
  const { app, db, call, signup, createGroup } =
      await startResourceApplication(t),
    a = await signup(),
    b = await signup();
  const me = await json<{ id: string }>(await call("auth/me", a));
  const group = await createGroup("합성 모임", a);
  const input = {
    requestKey: randomUUID(),
    expectedVersion: 0,
    title: "합성 일정",
    date: "2029-03-01",
    allDay: true,
    memo: "",
    groupId: group.id,
  };
  assert.equal(
    (
      await call("calendar", a, "POST", {
        ...input,
        allDay: false,
        startsAt: "2029-03-01T09:00:00",
      })
    ).status,
    400,
  );
  const create = () => call("calendar", a, "POST", input);
  const [r1, r2] = await Promise.all([create(), create()]);
  const s = await json<{ id: string; version: number }>(r1, 201),
    retry = await json<{ id: string }>(r2, 201);
  assert.equal(s.id, retry.id);
  assert.equal(
    (await call("calendar", a, "POST", { ...input, title: "다른 입력" }))
      .status,
    409,
  );
  assert.equal((await call(`calendar/${s.id}`, b)).status, 404);
  assert.equal(
    (await call("calendar", b, "POST", { ...input, requestKey: randomUUID() }))
      .status,
    404,
  );
  assert.equal(
    (await call("calendar?from=2029-01-01&to=2030-01-01", a)).status,
    400,
  );
  await app
    .get(CalendarService)
    .list(me.id, { from: "2029-03-01", to: "2029-04-01" });
  const personal = await json<{ schedules: unknown[] }>(
    await call("calendar?from=2029-03-01&to=2029-04-01", a),
  );
  assert.equal(personal.schedules.length, 0);
  const scoped = await json<{ schedules: unknown[] }>(
    await call(`calendar?from=2029-03-01&to=2029-04-01&groupId=${group.id}`, a),
  );
  assert.equal(scoped.schedules.length, 1);
  const reminders = app.get(RemindersService),
    notifications = app.get(NotificationsService),
    now = new Date("2029-02-28T00:01:00Z");
  await db.manager.update(
    CalendarSchedule,
    { id: s.id },
    { updatedAt: new Date("2029-02-27T00:00:00Z") },
  );
  await Promise.all([reminders.run(now), reminders.run(now)]);
  await reminders.run(now);
  let inbox = await notifications.inbox(me.id);
  assert.equal(inbox.items.length, 1);
  assert.equal(inbox.unread, 1);
  const through = inbox.through;
  const record = async (key: string) => {
    const event = randomUUID();
    const n: NotificationInput = {
      eventKey: key,
      kind: "MEMBERS_ADDED",
      category: "EVENT",
      eventId: event,
      requestId: event,
      revision: 1,
      accounts: [
        {
          id: me.id,
          title: "합성 알림",
          summary: "개인정보 없는 테스트",
          destination: `/events?event=${event}`,
        },
      ],
      messages: [],
    };
    await db.transaction((m) => notifications.record(m, n));
  };
  await record("new-" + s.id);
  await notifications.read(me.id, { through });
  inbox = await notifications.inbox(me.id);
  assert.equal(inbox.unread, 1);
  await notifications.read(me.id, { id: inbox.items[0].id });
  await notifications.read(me.id, { id: inbox.items[0].id });
  assert.equal((await notifications.inbox(me.id)).unread, 0);
  await notifications.savePreferences(me.id, {
    reservation: true,
    settlement: true,
    event: false,
    expectedVersion: 0,
  });
  await record("disabled-" + s.id);
  assert.equal((await notifications.inbox(me.id)).items.length, 2);
  await notifications.savePreferences(me.id, {
    reservation: true,
    settlement: true,
    event: true,
    expectedVersion: 1,
  });
  await record("disabled-" + s.id);
  assert.equal(
    (await notifications.inbox(me.id)).items.length,
    2,
    "a replay cannot resurrect suppressed delivery",
  );
  assert.equal(
    (
      await call(`calendar/${s.id}`, a, "POST", {
        ...input,
        expectedVersion: 8,
      })
    ).status,
    409,
  );
  await json(
    await call(`calendar/${s.id}`, a, "POST", {
      ...input,
      expectedVersion: 1,
      date: "2029-03-02",
    }),
    201,
  );
  const updateRetry = await json<{ version: number }>(
    await call(`calendar/${s.id}`, a, "POST", {
      ...input,
      expectedVersion: 1,
      date: "2029-03-02",
    }),
    201,
  );
  assert.equal(
    updateRetry.version,
    2,
    "lost update response reuses the receipt instead of incrementing again",
  );
  await reminders.run(now);
  assert.equal(
    (await notifications.inbox(me.id)).items.length,
    2,
    "old due date no longer sends",
  );
  await json(
    await call(`calendar/${s.id}/delete`, a, "POST", { expectedVersion: 2 }),
    201,
  );
  await reminders.run(new Date("2029-03-01T00:01:00Z"));
  assert.equal((await notifications.inbox(me.id)).items.length, 2);
  assert.equal((await call(`calendar/${s.id}`, a)).status, 404);
  // A newly created schedule after its reminder time does not catch up.
  const late = await json<{ id: string }>(
    await call("calendar", a, "POST", { ...input, requestKey: randomUUID() }),
    201,
  );
  await db.manager.update(
    CalendarSchedule,
    { id: late.id },
    { updatedAt: now },
  );
  await reminders.run(now);
  assert.equal((await notifications.inbox(me.id)).items.length, 2);
  const tail = await notifications.inbox(me.id, inbox.items[0].sequence);
  assert(
    tail.items.every(
      (r) => BigInt(r.sequence) < BigInt(inbox.items[0].sequence),
    ),
  );
});
test("phone change proofs bind purpose/account/session/number, atomic consume and lost response", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t, {
      OCTOMO_API_KEY: "synthetic-only",
    }),
    a = await signup(),
    b = await signup();
  const octomo = app.get(OctomoService);
  octomo.qrCode = async () => "synthetic-qr";
  octomo.exists = async () => true;
  const p = await json<{ id: string }>(
    await call("auth/profile/phone", a, "POST", { phone: "01000009991" }),
    201,
  );
  const payload = { id: p.id, phone: "01000009991" };
  assert.equal(
    (await call("auth/profile/phone/verify", b, "POST", payload)).status,
    400,
  );
  assert.equal(
    (
      await call("auth/profile/phone/verify", a, "POST", {
        ...payload,
        phone: "01000009992",
      })
    ).status,
    400,
  );
  await db.manager.update(
    PhoneChange,
    { id: p.id },
    { nextCheckAt: new Date(0) },
  );
  const results = await Promise.all([
    call("auth/profile/phone/verify", a, "POST", payload),
    call("auth/profile/phone/verify", a, "POST", payload),
  ]);
  assert(results.some((r) => r.status === 201));
  assert(results.every((r) => [201, 429].includes(r.status)));
  const retry = await json<{ status: string }>(
    await call("auth/profile/phone/verify", a, "POST", payload),
    201,
  );
  assert.equal(retry.status, "verified");
  assert.equal(
    (await json<{ phone: string }>(await call("auth/me", a))).phone,
    payload.phone,
  );
  const stored = await db.manager.findOneByOrFail(PhoneChange, { id: p.id });
  assert(stored.consumedAt);
  assert.equal(stored.purpose, "phone_change");
  // A proof cannot be used by another authenticated session of the same account.
  const login = await call("auth/login", "", "POST", {
    email: (await json<{ email: string }>(await call("auth/me", a))).email,
    password: "group-events-123",
  });
  assert.equal(login.status, 200);
  const jar = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.equal(
    (await call("auth/profile/phone/verify", jar, "POST", payload)).status,
    400,
  );
  await db.manager.update(
    AuthSession,
    { id: stored.sessionId },
    { revokedAt: new Date() },
  );
  assert.equal(
    (await call("auth/profile/phone/verify", a, "POST", payload)).status,
    401,
  );
});
test("store hours preserve defaults and historical conditions, merchant range is ownership bound", async (t) => {
  const { db, call, signup } = await startResourceApplication(t),
    owner = await signup(),
    other = await signup();
  await json(
    await call("auth/first-setup", owner, "PATCH", { accountType: "owner" }),
  );
  await json(
    await call("auth/first-setup", other, "PATCH", { accountType: "owner" }),
  );
  const me = await json<{ id: string }>(await call("auth/me", owner));
  const { Restaurant } =
    await import("../../src/modules/restaurants/entities/restaurant.entity.js");
  const { catalogPolicies, savePolicies, policyValues } =
    await import("../../src/modules/restaurants/lib/restaurant-policy.js");
  const id = randomUUID(),
    policies = catalogPolicies();
  policies.hours = { start: "10:00", end: "22:00", endDayOffset: 0 };
  policies.descriptionOverrides = ["operatingHours"];
  await db.manager.save(Restaurant, {
    id,
    ownerAccountId: me.id,
    name: `합성 매장 ${id}`,
    address: "테스트 전용 주소",
    region: "합성",
    published: true,
    isDemo: true,
    policies,
  });
  const path = `owner/restaurants/${id}/hours`;
  const current = await json<{
    version: number;
    hours: {
      days: {
        kind: string;
        start: string;
        end: string;
        endDayOffset: number;
      }[];
      note: string;
    };
  }>(await call(path, owner));
  assert.equal(current.hours.days.length, 7);
  const hours = {
    ...current.hours,
    days: current.hours.days.map((d, i) =>
      i === 1
        ? { kind: "OPEN", start: "18:00", end: "02:00", endDayOffset: 1 }
        : i === 2
          ? { ...d, kind: "CLOSED" }
          : d,
    ),
    note: "합성 비정기 휴무 안내",
  };
  assert.equal(
    (await call(path, other, "PUT", { expectedVersion: 1, hours })).status,
    404,
  );
  await json(await call(path, owner, "PUT", { expectedVersion: 1, hours }));
  assert.equal(
    (await call(path, owner, "PUT", { expectedVersion: 1, hours })).status,
    409,
  );
  const publicDetail = await json<{ operatingHours: string }>(
    await call(`restaurants/${id}`),
  );
  assert.match(publicDetail.operatingHours, /익일 02:00/);
  assert.match(publicDetail.operatingHours, /비정기 휴무 안내/);
  const stored = await db.manager.findOneByOrFail(Restaurant, { id });
  assert.deepEqual(stored.policies.hours, policies.hours);
  assert.deepEqual(
    savePolicies(policyValues(stored.policies), stored.policies, false)
      .weeklyHours,
    stored.policies.weeklyHours,
    "older registration clients preserve weekly hours",
  );
  const url = `calendar?from=2029-03-01&to=2029-04-01&restaurantId=${id}`;
  assert.equal((await call(url, other)).status, 404);
  const calendar = await json<{ reservations: unknown[] }>(
    await call(url, owner),
  );
  assert.equal(calendar.reservations.length, 0);
  await db.manager.delete(Restaurant, { id });
});

test("reminder batch isolates a failed commit and settings serialize against delivery", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  const session = await signup();
  const me = await json<{ id: string }>(await call("auth/me", session));
  const notifications = app.get(NotificationsService);
  const reminders = app.get(RemindersService);
  for (const title of ["합성 일정 A", "합성 일정 B"]) {
    const row = await json<{ id: string }>(
      await call("calendar", session, "POST", {
        requestKey: randomUUID(),
        expectedVersion: 0,
        title,
        date: "2030-04-02",
        allDay: true,
        memo: "",
      }),
      201,
    );
    await db.manager.update(
      CalendarSchedule,
      { id: row.id },
      { updatedAt: new Date("2030-03-30T00:00:00Z") },
    );
  }
  const record = notifications.record.bind(notifications);
  let failOnce = true;
  notifications.record = async (m, input) => {
    await record(m, input);
    if (input.accounts.some((a) => a.id === me.id) && failOnce) {
      failOnce = false;
      throw new Error("synthetic failure before commit");
    }
  };
  try {
    const first = await reminders.run(new Date("2030-04-01T00:01:00Z"));
    assert.equal(first.failed, 1);
    assert.equal((await notifications.inbox(me.id)).items.length, 1);
  } finally {
    notifications.record = record;
  }
  await reminders.run(new Date("2030-04-01T00:01:00Z"));
  assert.equal((await notifications.inbox(me.id)).items.length, 2);
  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    locked = r;
  });
  const eventId = randomUUID();
  const writing = db.transaction(async (m) => {
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `inbox:${me.id}`,
    ]);
    locked();
    await gate;
    await record(m, {
      eventKey: `race:${eventId}`,
      kind: "MEMBERS_ADDED",
      category: "EVENT",
      eventId,
      requestId: eventId,
      revision: 1,
      accounts: [
        {
          id: me.id,
          title: "합성 경합",
          summary: "설정 이전에 시작된 기록",
          destination: `/events?event=${eventId}`,
        },
      ],
      messages: [],
    });
  });
  await ready;
  const setting = notifications.savePreferences(me.id, {
    reservation: true,
    settlement: true,
    event: false,
    expectedVersion: 0,
  });
  release();
  await Promise.all([writing, setting]);
  assert.equal((await notifications.inbox(me.id)).items.length, 3);
  await db.transaction((m) =>
    record(m, {
      eventKey: `after:${eventId}`,
      kind: "MEMBERS_ADDED",
      category: "EVENT",
      eventId,
      requestId: eventId,
      revision: 2,
      accounts: [
        {
          id: me.id,
          title: "합성 경합",
          summary: "설정 이후 기록",
          destination: `/events?event=${eventId}`,
        },
      ],
      messages: [],
    }),
  );
  assert.equal((await notifications.inbox(me.id)).items.length, 3);
  assert.equal(
    (await call("notifications?before=9999999999999999999", session)).status,
    400,
  );
});
