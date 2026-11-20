// Executed with node --input-type=module --eval from an isolated built API directory.
// The same probe runs against test compilation and the production Docker image.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "node:test";
import { NestFactory } from "@nestjs/core";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AppModule } from "./dist/app.module.js";
import { DatabaseService } from "./dist/database/database.service.js";
import { ConfigService } from "./dist/config/config.service.js";
import { Account } from "./dist/modules/auth/entities/account.entity.js";
import { CalendarService } from "./dist/modules/calendar/calendar.service.js";
import { CalendarSchedule } from "./dist/modules/calendar/entities/calendar-schedule.entity.js";
import { RemindersService } from "./dist/modules/calendar/reminders.service.js";
import { EventsService } from "./dist/modules/events/events.service.js";
import { Event } from "./dist/modules/events/entities/event.entity.js";
import { Restaurant } from "./dist/modules/restaurants/entities/restaurant.entity.js";
import { ReservationRequest } from "./dist/modules/reservations/entities/reservation-request.entity.js";
import { RequestTarget } from "./dist/modules/reservations/entities/request-target.entity.js";
import { SelectedReservation } from "./dist/modules/reservations/entities/selected-reservation.entity.js";
import { createOperationsApplication } from "./scripts/operations-application.mjs";

assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.env.MESSAGE_PROVIDER, "fake");
assert.equal(process.env.GEOCODING_PROVIDER, "fake");
assert.equal(process.env.REMINDERS_ENABLED, "true");
assert.equal(existsSync("scripts/calendar-reminders.mjs"), false);
assert.equal(
  JSON.parse(await readFile("package.json", "utf8")).scripts[
    "calendar:reminders"
  ],
  undefined,
);
const now = "2035-04-01T00:05:00Z";
mock.timers.enable({ apis: ["Date"], now: new Date(now) });
const directory = await mkdtemp(join(tmpdir(), "reminder-probe-"));
const app = await createOperationsApplication();
let cleanup = async () => {};
try {
  assert.equal(app.get(ConfigService).environment.remindersEnabled, false);
  assert.equal(
    app.get(SchedulerRegistry).getCronJob("calendar-reminders").isActive,
    false,
  );
  const db = await app.get(DatabaseService).connect();
  const owner = randomUUID();
  const restaurant = randomUUID();
  cleanup = () =>
    db.transaction(async (m) => {
      // Remove only this probe's UUID-scoped fixtures, including on assertion failure.
      await m.query("DELETE FROM notifications WHERE account_id=$1", [owner]);
      await m.query(
        "DELETE FROM notification_facts WHERE event_id IN (SELECT id FROM events WHERE creator_id=$1 UNION ALL SELECT id FROM calendar_schedules WHERE creator_id=$1)",
        [owner],
      );
      await m.query("DELETE FROM selected_reservations WHERE selected_by=$1", [
        owner,
      ]);
      await m.query(
        "DELETE FROM reservation_request_targets WHERE restaurant_id=$1",
        [restaurant],
      );
      await m.query(
        "DELETE FROM reservation_requests WHERE event_id IN (SELECT id FROM events WHERE creator_id=$1)",
        [owner],
      );
      await m.query(
        "DELETE FROM calendar_commands WHERE schedule_id IN (SELECT id FROM calendar_schedules WHERE creator_id=$1)",
        [owner],
      );
      await m.query("DELETE FROM calendar_schedules WHERE creator_id=$1", [
        owner,
      ]);
      await m.query("DELETE FROM events WHERE creator_id=$1", [owner]);
      await m.query("DELETE FROM restaurants WHERE id=$1", [restaurant]);
      await m.query("DELETE FROM accounts WHERE id=$1", [owner]);
    });
  await db.manager.insert(Account, {
    id: owner,
    email: `${owner}@example.test`,
    createdAt: new Date(),
  });
  const events = app.get(EventsService),
    calendar = app.get(CalendarService);
  const eligible = async (title) => {
    const event = await events.create(owner, {
      creationKey: randomUUID(),
      name: title,
      scheduledAt: "2035-04-02T03:00:00Z",
    });
    const other = await calendar.save(owner, {
      requestKey: randomUUID(),
      expectedVersion: 0,
      title,
      date: "2035-04-02",
      allDay: true,
      memo: "",
    });
    // Fixture is genuinely eligible at 09:05, having been scheduled before 09:00.
    for (const [entity, id] of [
      [Event, event.id],
      [CalendarSchedule, other.id],
    ])
      await db.manager.update(
        entity,
        { id },
        { scheduleUpdatedAt: new Date("2035-03-31T00:00:00Z") },
      );
    return event;
  };
  const event = await eligible("CLI 격리 검증");
  // Minimal synthetic reservation supports successful inspect AND preview, without dispatching providers.
  const request = randomUUID(),
    target = randomUUID(),
    reservation = randomUUID();
  await db.manager.insert(Restaurant, {
    id: restaurant,
    name: `격리 ${restaurant}`,
    address: `가상 ${restaurant}`,
    region: "가상",
    isDemo: true,
  });
  await db.manager.insert(ReservationRequest, {
    id: request,
    eventId: event.id,
    requestKey: randomUUID(),
    digest: "test",
    snapshot: { eventName: "격리 검증" },
    contactName: "테스트",
    contactPhone: "01000000000",
    createdAt: new Date(),
    state: "SELECTED",
  });
  await db.manager.insert(RequestTarget, {
    id: target,
    requestId: request,
    restaurantId: restaurant,
    restaurantName: "가상 매장",
    address: "가상 주소",
    isDemo: true,
    contactId: randomUUID(),
    contactName: "테스트",
    contactPhone: "01000000000",
    consentAt: new Date(),
    candidateState: "SELECTED",
  });
  await db.manager.insert(SelectedReservation, {
    id: reservation,
    eventId: event.id,
    requestId: request,
    targetId: target,
    revision: 1,
    selectedBy: owner,
    selectedAt: new Date(),
    snapshot: {
      offered: {
        startsAt: "2035-04-02T03:00:00Z",
        expectedGuests: 20,
        seating: "ANY",
        space: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "NONE", amount: 0 },
        menuDeadlineAt: null,
        note: "",
        changeCancellationPolicy: "테스트",
      },
    },
  });
  const fingerprint = async () => {
    const result = [];
    for (const table of [
      "notification_facts",
      "notifications",
      "notification_messages",
    ])
      result.push(
        await db.query(
          `SELECT * FROM ${table} WHERE event_key LIKE 'reminder:%' ORDER BY event_key`,
        ),
      );
    return result;
  };
  const clock = join(directory, "clock.mjs");
  await writeFile(
    clock,
    `import { mock } from 'node:test'; mock.timers.enable({apis:['Date'],now:new Date('${now}')});`,
  );
  const input = join(directory, "input.json");
  await writeFile(
    input,
    JSON.stringify({ requestKey: randomUUID(), expectedVersion: 1 }),
    { mode: 0o600 },
  );
  const env = {
    ...process.env,
    REMINDERS_ENABLED: "true",
    NODE_OPTIONS: `--import=${clock}`,
    TZ: "UTC",
  };
  const cli = (script, args = [], pnpm = false) => {
    const result = spawnSync(
      pnpm ? "pnpm" : process.execPath,
      // The isolated fixture reuses frozen-installed node_modules by symlink.
      // It has no workspace lockfile, so pnpm must not reinstall those modules.
      pnpm
        ? ["--config.verify-deps-before-run=false", "run", script, ...args]
        : [`scripts/${script}.mjs`, ...args],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(
      result.status,
      0,
      `${script}: ${result.stderr}\n${result.stdout}`,
    );
  };
  const operator = ["--actor", "test", "--reason", "격리 검증"];
  const completion = [
    "--reservation",
    reservation,
    ...operator,
    "--confirmer",
    "테스트",
    "--method",
    "PHONE",
    "--confirmed-at",
    now,
  ];
  const before = await fingerprint();
  for (const [script, args] of [
    ["merchant-operations", ["--action", "deliveries"]],
    [
      "merchant-operations",
      ["--action", "publish", "--restaurant", restaurant, ...operator],
    ],
    ["reservation-operations", ["--action", "notifications"]],
    ["reservation-operations", ["--action", "expire", ...operator]],
    ["reservation-completion", ["--action", "inspect", ...completion]],
    [
      "reservation-completion",
      ["--action", "guidance", ...completion, "--input", input],
    ],
    ["normalize-restaurant-address", ["--list"]],
  ]) {
    cli(script, args);
    assert.deepEqual(
      await fingerprint(),
      before,
      `${script} changed reminder records`,
    );
  }
  if (process.env.REMINDER_PROBE_PNPM === "true") {
    cli("merchant:operations", ["--action", "deliveries"], true);
    assert.deepEqual(await fingerprint(), before);
  }
  process.env.REMINDERS_ENABLED = "true";
  for (let restart = 0; restart < 3; restart++) {
    const api = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      let finished;
      const completed = new Promise((resolve) => {
        finished = resolve;
      });
      const reminders = api.get(RemindersService),
        run = reminders.run.bind(reminders);
      reminders.run = async (...args) => {
        const result = await run(...args);
        finished(result);
        return result;
      };
      await api.init();
      assert.equal(api.get(ConfigService).environment.remindersEnabled, true);
      assert.equal(
        api.get(SchedulerRegistry).getCronJob("calendar-reminders").isActive,
        true,
      );
      const result = await completed;
      assert.equal(result.failed, 0);
      assert.equal(result.checked, restart === 0 ? 2 : 0);
      const records = await fingerprint();
      assert.equal(records[0].length, before[0].length + 2);
      assert.equal(records[1].length, before[1].length + 2);
      assert.deepEqual(records[2], before[2]);
    } finally {
      await api.close();
    }
  }
  assert.equal(
    process.env.REMINDERS_ENABLED,
    "true",
    "child CLI settings never disable the API parent",
  );
  console.log(
    "Reminder runtime probe passed: CLI isolation, API startup/restarts, no manual reminder CLI or SMS",
  );
} finally {
  await cleanup();
  await app.close();
  mock.timers.reset();
  await rm(directory, { recursive: true, force: true });
}
