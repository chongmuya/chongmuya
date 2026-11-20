import "reflect-metadata";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DataSource } from "typeorm";
import { databaseOptions } from "../../src/database/database-options.js";

test("operator queries and previews never start background reminders after 09:00 KST", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const db = new DataSource(
    databaseOptions({ databaseUrl: process.env.TEST_DATABASE_URL }),
  );
  await db.initialize();
  t.after(() => db.destroy());
  await db.runMigrations();
  const directory = await mkdtemp(join(tmpdir(), "operator-startup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const probe = join(directory, "probe.mjs"),
    marker = join(directory, "reminder-started");
  // Use compiled test sources even when dist has not been built. Observe the
  // real Nest lifecycle, replacing only reminder execution to avoid extra writes.
  await writeFile(
    probe,
    `import ${JSON.stringify(new URL("../../../node_modules/reflect-metadata/Reflect.js", import.meta.url).href)};
     import { registerHooks } from 'node:module';
     import { writeFileSync } from 'node:fs';
     import { mock } from 'node:test';
     mock.timers.enable({apis:['Date'], now:new Date('2035-04-01T00:05:00Z')});
     registerHooks({resolve(specifier, context, next) {
       return next(specifier.startsWith('../dist/')
         ? specifier.replace('../dist/', '../dist-test/src/') : specifier, context);
     }});
     const { RemindersService } = await import(${JSON.stringify(new URL("../../src/modules/calendar/reminders.service.js", import.meta.url).href)});
     RemindersService.prototype.run = async function () {
       writeFileSync(${JSON.stringify(marker)}, 'ran');
       return {checked: 0, failed: 0};
     };`,
  );
  const run = (name: string, args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        probe,
        fileURLToPath(new URL(`../../../scripts/${name}.mjs`, import.meta.url)),
        ...args,
      ],
      {
        cwd: directory,
        env: {
          NODE_ENV: "test",
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          AUTH_SECRET: "test-operator-secret-at-least-32-characters",
          WEB_ORIGIN: "http://localhost:3000",
          MESSAGE_PROVIDER: "fake",
          GEOCODING_PROVIDER: "fake",
          REMINDERS_ENABLED: "true",
        },
        encoding: "utf8",
        timeout: 15_000,
      },
    );
  const cases: [string, string[], number][] = [
    ["merchant-operations", ["--action", "deliveries"], 0],
    ["reservation-operations", ["--action", "notifications"], 0],
    ["normalize-restaurant-address", ["--list"], 0],
    [
      "reservation-completion",
      [
        "--action",
        "inspect",
        "--reservation",
        randomUUID(),
        "--actor",
        "test-operator",
        "--reason",
        "startup probe",
        "--confirmer",
        "test-merchant",
        "--method",
        "PHONE",
        "--confirmed-at",
        new Date().toISOString(),
      ],
      1, // A nonexistent reservation must fail after startup, without side effects.
    ],
  ];
  for (const [name, args, status] of cases) {
    await t.test(name, async () => {
      const result = run(name, args);
      assert.equal(result.status, status, `${name}: ${result.stderr}`);
      await assert.rejects(access(marker), { code: "ENOENT" });
    });
    await rm(marker, { force: true });
  }
});
