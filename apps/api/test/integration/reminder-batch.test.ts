import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { CalendarService } from "../../src/modules/calendar/calendar.service.js";
import { CalendarSchedule } from "../../src/modules/calendar/entities/calendar-schedule.entity.js";
import { RemindersService } from "../../src/modules/calendar/reminders.service.js";
import { EventsService } from "../../src/modules/events/events.service.js";
import { Event } from "../../src/modules/events/entities/event.entity.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";
import {
  NotificationFact,
  Notification,
} from "../../src/modules/notifications/entities/notification.entity.js";

test("batch candidates are exactly tomorrow KST, and post-09:00 edits/deletion/settings remain excluded", async (t) => {
  const { app, db, signup, call } = await startResourceApplication(t);
  const jar = await signup();
  const { id: owner } = (await (await call("auth/me", jar)).json()) as {
    id: string;
  };
  const events = app.get(EventsService),
    calendar = app.get(CalendarService);
  const reminders = app.get(RemindersService),
    notices = app.get(NotificationsService);
  const now = new Date("2036-01-01T14:59:00Z");
  const expected: string[] = [];
  for (const [at, include] of [
    ["2035-12-31T15:00:00Z", false],
    ["2036-01-01T14:59:59.999Z", false],
    ["2036-01-01T15:00:00Z", true],
    ["2036-01-02T14:59:59.999Z", true],
    ["2036-01-02T15:00:00Z", false],
  ] as const) {
    const event = await events.create(owner, {
      creationKey: randomUUID(),
      name: "경계 행사",
      scheduledAt: at,
    });
    if (include) expected.push(event.id);
  }
  const makeSchedule = (date: string) =>
    calendar.save(owner, {
      requestKey: randomUUID(),
      expectedVersion: 0,
      title: "경계 일정",
      date,
      allDay: true,
      memo: "",
    });
  for (const date of ["2035-12-31", "2036-01-01", "2036-01-02", "2036-01-03"]) {
    const row = await makeSchedule(date);
    if (date === "2036-01-02") expected.push(row.id);
  }
  const deleted = await makeSchedule("2036-01-02");
  await calendar.remove(owner, deleted.id, 1);
  const late = await makeSchedule("2036-01-02");
  await db.manager.update(
    CalendarSchedule,
    { id: late.id },
    { scheduleUpdatedAt: new Date("2036-01-01T00:00:00.001Z") },
  );
  const changed = await events.create(owner, {
    creationKey: randomUUID(),
    name: "늦은 변경",
    scheduledAt: "2036-01-02T03:00:00Z",
  });
  await db.manager.update(
    Event,
    { id: changed.id },
    { scheduleUpdatedAt: new Date("2036-01-01T00:00:00.001Z") },
  );
  assert.deepEqual(await reminders.run(new Date("2035-12-31T23:59:59Z")), {
    checked: 0,
    failed: 0,
  });
  await reminders.run(now);
  const facts = (await notices.inbox(owner)).items.map(
    (row) => row.fact!.eventId,
  );
  assert.deepEqual(facts.sort(), expected.sort());
  assert.equal((await reminders.run(now)).checked, 0);

  await notices.savePreferences(owner, {
    reservation: true,
    settlement: true,
    event: false,
    expectedVersion: 0,
  });
  const suppressed = await makeSchedule("2036-01-02");
  await reminders.run(now);
  const eventKey = `reminder:OTHER:${suppressed.id}:1`;
  assert(await db.manager.existsBy(NotificationFact, { eventKey }));
  assert.equal(await db.manager.countBy(Notification, { eventKey }), 0);
  await notices.savePreferences(owner, {
    reservation: true,
    settlement: true,
    event: true,
    expectedVersion: 1,
  });
  await reminders.run(now);
  assert.equal(await db.manager.countBy(Notification, { eventKey }), 0);
});

test("receipt filtering still pages past a fully processed page; expired in-flight batch cannot save", async (t) => {
  const { app, db, signup, call } = await startResourceApplication(t);
  const { id: owner } = (await (
    await call("auth/me", await signup())
  ).json()) as { id: string };
  const calendar = app.get(CalendarService),
    reminders = app.get(RemindersService);
  const notices = app.get(NotificationsService);
  const seed = await calendar.save(owner, {
    requestKey: randomUUID(),
    expectedVersion: 0,
    title: "페이지 일정",
    date: "2037-01-02",
    allDay: true,
    memo: "",
  });
  const row = await db.manager.findOneByOrFail(CalendarSchedule, {
    id: seed.id,
  });
  await db.manager.insert(
    CalendarSchedule,
    Array.from({ length: 100 }, () => ({
      ...row,
      id: randomUUID(),
      creationKey: randomUUID(),
    })),
  );
  const now = new Date("2037-01-01T00:05:00Z");
  const original = notices.record.bind(notices);
  let called = 0;
  const record = t.mock.method(
    notices,
    "record",
    async (...args: Parameters<typeof original>) => {
      if (++called === 101) throw new Error("synthetic last-page failure");
      return original(...args);
    },
  );
  assert.deepEqual(await reminders.run(now), { checked: 100, failed: 1 });
  record.mock.restore();
  assert.deepEqual(await reminders.run(now), { checked: 1, failed: 0 });
  assert.equal(
    await db.manager.countBy(Notification, { accountId: owner }),
    101,
  );

  const events = app.get(EventsService);
  const event = await events.create(owner, {
    creationKey: randomUUID(),
    name: "자정 잠금 대기",
    scheduledAt: "2037-01-02T03:00:00Z",
  });
  let active = true;
  const current = events.reminderCurrent.bind(events);
  const resourceLock = t.mock.method(
    events,
    "reminderCurrent",
    async (...args: Parameters<typeof current>) => {
      const result = await current(...args);
      active = false; // Date changed or shutdown began while waiting for the resource lock.
      return result;
    },
  );
  await reminders.run(now, () => active);
  assert.equal(
    await db.manager.existsBy(NotificationFact, {
      eventKey: `reminder:EVENT:${event.id}:1`,
    }),
    false,
  );
  resourceLock.mock.restore();
  active = true;
  const lockAccount = notices.lockAccount.bind(notices);
  const recipientLock = t.mock.method(
    notices,
    "lockAccount",
    async (...args: Parameters<typeof lockAccount>) => {
      await lockAccount(...args);
      active = false;
    },
  );
  await reminders.run(now, () => active);
  assert.equal(recipientLock.mock.callCount(), 1);
  assert.equal(
    await db.manager.existsBy(NotificationFact, {
      eventKey: `reminder:EVENT:${event.id}:1`,
    }),
    false,
  );
});
