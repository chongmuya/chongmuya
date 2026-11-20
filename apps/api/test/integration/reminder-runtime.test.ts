import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startResourceApplication } from "../support/resource-application.js";

test("compiled CLI entrypoints with eligible reminders isolate inherited true; API still delivers without a manual reminder CLI", async (t) => {
  await startResourceApplication(t);
  const directory = await mkdtemp(join(tmpdir(), "reminder-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL("../../src/", import.meta.url), join(directory, "dist"), {
    recursive: true,
  });
  await cp(
    new URL("../../../scripts/", import.meta.url),
    join(directory, "scripts"),
    { recursive: true },
  );
  await cp(
    new URL("../../../package.json", import.meta.url),
    join(directory, "package.json"),
  );
  await symlink(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    join(directory, "node_modules"),
    "dir",
  );
  const probe = await readFile(
    new URL("../../../../../infra/reminder-runtime-probe.mjs", import.meta.url),
    "utf8",
  );
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", probe],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_SECRET: "test-secret-with-at-least-32-characters",
        WEB_ORIGIN: "http://localhost:3000",
        MESSAGE_PROVIDER: "fake",
        GEOCODING_PROVIDER: "fake",
        REMINDERS_ENABLED: "true",
        REMINDER_PROBE_PNPM: "true",
      },
      encoding: "utf8",
      timeout: 60000,
    },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Reminder runtime probe passed/);
});
