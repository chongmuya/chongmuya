import "reflect-metadata";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ScheduleModule, SchedulerRegistry } from "@nestjs/schedule";
import { ConfigService } from "../src/config/config.service.js";
import { parseEnvironment } from "../src/config/environment.js";
import { RemindersService } from "../src/modules/calendar/reminders.service.js";
import {
  ReminderSchedulerService,
  REMINDER_JOB,
} from "../src/modules/calendar/reminder-scheduler.service.js";

async function setup(
  t: TestContext,
  now: string,
  enabled: string | null = "true",
  run: (
    at: Date,
    isActive: () => boolean,
  ) => Promise<{ checked: number; failed: number }> = async () => ({
    checked: 1,
    failed: 0,
  }),
) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date(now) });
  const logs: string[] = [];
  t.mock.method(Logger.prototype, "warn", (message: string) =>
    logs.push(message),
  );
  t.mock.method(Logger.prototype, "error", (message: string) =>
    logs.push(message),
  );
  const calls: { at: Date; wall: Date }[] = [];
  const environment = parseEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:25436/chongmuya_test",
    AUTH_SECRET: "test-secret-with-at-least-32-characters",
    WEB_ORIGIN: "http://localhost:3000",
    REMINDERS_ENABLED: enabled ?? undefined,
  });
  const app = await Test.createTestingModule({
    imports: [ScheduleModule.forRoot()],
    providers: [
      ReminderSchedulerService,
      { provide: ConfigService, useValue: { environment } },
      {
        provide: RemindersService,
        useValue: {
          run: (at: Date, isActive: () => boolean) => {
            calls.push({ at, wall: new Date() });
            return run(at, isActive);
          },
        },
      },
    ],
  }).compile();
  await app.init();
  await setImmediate();
  t.after(async () => {
    await app.close();
    t.mock.timers.reset();
  });
  const advance = async (milliseconds: number) => {
    t.mock.timers.tick(milliseconds);
    await setImmediate();
  };
  return {
    app,
    calls,
    logs,
    advance,
    scheduler: app.get(ReminderSchedulerService),
    registry: app.get(SchedulerRegistry),
    job: app.get(SchedulerRegistry).getCronJob(REMINDER_JOB),
  };
}

test("false and unset disable cron, startup recovery and retries", async (t) => {
  for (const enabled of ["false", null]) {
    await t.test(String(enabled), async (t) => {
      const s = await setup(t, "2030-04-01T00:05:00Z", enabled);
      assert.equal(s.job.isActive, false);
      await s.scheduler.startToday();
      await s.advance(2 * 86400000);
      assert.equal(s.calls.length, 0);
    });
  }
});

test("08:59 KST waits for 09:00, then no polling until the next daily cron", async (t) => {
  const s = await setup(t, "2030-03-31T23:59:00Z");
  assert.equal(s.registry.getCronJobs().size, 1);
  assert.equal(s.job.cronTime.timeZone, "Asia/Seoul");
  assert.equal(s.calls.length, 0);
  await s.advance(59999);
  assert.equal(s.calls.length, 0);
  await s.advance(1);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].wall.toISOString(), "2030-04-01T00:00:00.000Z");
  await s.advance(60 * 60000);
  assert.equal(s.calls.length, 1);
  await s.advance(23 * 60 * 60000);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].at.toISOString(), "2030-04-02T00:00:00.000Z");
});

test("09:05 startup recovers once and concurrent cron/bootstrap entry cannot replay it", async (t) => {
  const s = await setup(t, "2030-04-01T00:05:00Z");
  assert.equal(s.calls.length, 1);
  s.scheduler.onApplicationBootstrap();
  await s.scheduler.startToday();
  await s.job.fireOnTick();
  await s.advance(30 * 60000);
  assert.equal(s.calls.length, 1);
});

test("lookup error then partial failure retries after each failure and stops on success", async (t) => {
  let attempt = 0;
  const s = await setup(t, "2030-04-01T00:05:00Z", "true", async () => {
    if (++attempt === 1) throw new Error("private SQL token sentinel");
    return { checked: 2, failed: attempt === 2 ? 1 : 0 };
  });
  await s.advance(59999);
  assert.equal(s.calls.length, 1);
  await s.advance(1);
  assert.equal(s.calls.length, 2);
  await s.scheduler.startToday();
  await s.advance(299999);
  assert.equal(s.calls.length, 2);
  await s.advance(1);
  assert.equal(s.calls.length, 3);
  assert(s.calls.every((c) => c.at.getTime() === s.calls[0].at.getTime()));
  await s.advance(60 * 60000);
  assert.equal(s.calls.length, 3);
  assert.doesNotMatch(s.logs.join(" "), /private|SQL|token|sentinel/);
});

test("all failures use 1/5/15 minute delays with only three extra attempts", async (t) => {
  const s = await setup(t, "2030-04-01T00:05:00Z", "true", async () => {
    throw new Error("private connection URL");
  });
  for (const delay of [60000, 300000, 900000]) {
    const before = s.calls.length;
    await s.advance(delay - 1);
    assert.equal(s.calls.length, before);
    await s.advance(1);
    assert.equal(s.calls.length, before + 1);
  }
  assert.equal(s.calls.length, 4);
  assert.equal(s.logs.filter((l) => l.includes("RETRIES_EXHAUSTED")).length, 1);
  await s.advance(60 * 60000);
  await s.scheduler.startToday();
  assert.equal(s.calls.length, 4);
});

test("retry across Korean midnight expires without switching batch dates", async (t) => {
  const s = await setup(t, "2030-04-01T14:59:30Z", "true", async () => ({
    checked: 0,
    failed: 1,
  }));
  await s.advance(60000);
  assert.equal(s.calls.length, 1);
  await s.advance(60 * 60000);
  assert.equal(s.calls.length, 1);
  // The next 09:00 cron gets a fresh date and its own retry allowance.
  t.mock.timers.setTime(new Date("2030-04-02T00:00:00Z").getTime());
  await s.scheduler.startToday();
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].at.toISOString(), "2030-04-02T00:00:00.000Z");
});

test("startup, cron and retry share one in-flight guard; shutdown waits without rescheduling", async (t) => {
  let finish!: (result: { checked: number; failed: number }) => void;
  let active!: () => boolean;
  let attempts = 0;
  const s = await setup(
    t,
    "2030-04-01T00:05:00Z",
    "true",
    async (_at, isActive) => {
      active = isActive;
      if (++attempts === 1) return { checked: 0, failed: 1 };
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  );
  await s.advance(60000);
  await s.scheduler.startToday();
  s.scheduler.onApplicationBootstrap();
  await s.job.fireOnTick();
  await s.advance(30 * 60000);
  assert.equal(s.calls.length, 2);
  const closed = s.app.close();
  await setImmediate();
  assert.equal(active(), false);
  finish({ checked: 0, failed: 1 });
  await closed;
  assert.equal(s.job.isActive, false);
  await s.advance(2 * 86400000);
  await s.scheduler.startToday();
  assert.equal(s.calls.length, 2);
});

test("shutdown clears a waiting retry", async (t) => {
  const s = await setup(t, "2030-04-01T00:05:00Z", "true", async () => ({
    checked: 0,
    failed: 1,
  }));
  await s.app.close();
  await s.advance(2 * 86400000);
  assert.equal(s.calls.length, 1);
});
