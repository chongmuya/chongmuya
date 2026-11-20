import "reflect-metadata";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  stat,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DataSource, In } from "typeorm";
import { databaseOptions } from "../../src/database/database-options.js";
import { demoAccounts } from "../../src/database/seeds/demo.seed.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { verifyPassword } from "../../src/modules/auth/utils/password.js";
import { restaurantDataFixture } from "../support/restaurant-data.js";

test("compiled data CLI uses only DB settings and local seed rejects unsafe targets without exposing input", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const directory = await mkdtemp(path.join(tmpdir(), "chongmuya-data-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(
    new URL("../../src/", import.meta.url),
    path.join(directory, "dist"),
    { recursive: true },
  );
  await cp(
    new URL("../../../scripts/", import.meta.url),
    path.join(directory, "scripts"),
    { recursive: true },
  );
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await symlink(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    path.join(directory, "node_modules"),
    "dir",
  );
  const db = new DataSource(
    databaseOptions({ databaseUrl: process.env.TEST_DATABASE_URL }),
  );
  await db.initialize();
  t.after(() => db.destroy());
  await db.runMigrations();
  const fixture = restaurantDataFixture(`cli-${randomUUID()}`);
  fixture.restaurants[0]!.menus = Array.from({ length: 400 }, (_, i) => ({
    ...fixture.restaurants[0]!.menus[0]!,
    key: `menu-${i}`,
    name: `가상 파일 크기 검증 메뉴 ${i}`,
    position: i,
  }));
  const input = path.join(directory, "input.private.json");
  await writeFile(input, JSON.stringify(fixture), { mode: 0o600 });
  assert((await stat(input)).size > 32768);
  const data = (extra: string[] = [], env: NodeJS.ProcessEnv = {}) =>
    spawnSync(
      process.execPath,
      [
        path.join(directory, "scripts/restaurant-data.mjs"),
        "import",
        "--file",
        input,
        "--actor",
        "test",
        "--reason",
        "fixture",
        ...extra,
      ],
      {
        cwd: directory,
        env: {
          NODE_ENV: "test",
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          SOLAPI_SENDER_NUMBER: "not-loaded",
          ...env,
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  const preview = data();
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).created, 4);
  const applied = data(["--execute"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(data(["--execute"]).stdout).skipped, 4);
  for (const env of [
    { NODE_ENV: "production" },
    {
      DATABASE_URL: "postgresql://secret-sentinel@remote.example.test/catalog",
    },
  ]) {
    const result = data([], env);
    assert.equal(result.status, 1);
    assert.doesNotMatch(
      result.stderr,
      /secret-sentinel|postgresql:|Error:| at /,
    );
  }
  assert.doesNotMatch(preview.stdout + applied.stdout, /0100000900|test-only/);
  const demoOutput = path.join(directory, "demo.links.json");
  const demoEnv = {
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    WEB_ORIGIN: "http://localhost:3000",
    AUTH_SECRET: "test-secret-with-at-least-32-characters",
    MESSAGE_PROVIDER: "fake",
    SOLAPI_SENDER_NUMBER: "bad-ignored-external-setting",
  };
  const demo = (
    command: string,
    output: string,
    extra: NodeJS.ProcessEnv = {},
  ) =>
    spawnSync(
      process.execPath,
      [
        path.join(directory, "dist/database/seeds/run-demo.js"),
        command,
        "--output",
        output,
      ],
      {
        cwd: directory,
        env: { ...demoEnv, ...extra },
        encoding: "utf8",
        timeout: 15000,
      },
    );
  for (const extra of [
    { NODE_ENV: "production" },
    { MESSAGE_PROVIDER: "solapi" },
    { DATABASE_URL: "postgresql://secret-sentinel@remote.example.test/demo" },
    { DEMO_SEED_PASSWORD: "short" },
  ]) {
    const denied = demo("seed", demoOutput, extra);
    assert.equal(denied.status, 1);
    assert.doesNotMatch(
      denied.stdout + denied.stderr,
      /secret-sentinel|Demo1234!|short/,
    );
  }
  const seeded = demo("seed", demoOutput);
  assert.equal(seeded.status, 0, seeded.stderr);
  assert.equal((await stat(demoOutput)).mode & 0o777, 0o600);
  const manifest = JSON.parse(await readFile(demoOutput, "utf8"));
  assert(manifest.merchantReplies.length > 0);
  assert.doesNotMatch(
    seeded.stdout + seeded.stderr,
    /#token=|Demo1234!|scrypt-v1/,
  );
  const accounts = await db.getRepository(Account).findBy({
    id: In(demoAccounts.map((account) => account.id)),
  });
  assert.equal(accounts.length, demoAccounts.length);
  for (const account of accounts)
    assert(await verifyPassword("Demo1234!", account.passwordHash!));
  assert.equal(
    demo("seed", path.join(directory, "reseed.links.json"), {
      DEMO_SEED_PASSWORD: "different-123",
    }).status,
    0,
  );
  for (const account of accounts)
    assert.equal(
      (await db.getRepository(Account).findOneByOrFail({ id: account.id }))
        .passwordHash,
      account.passwordHash,
    );
  const original = await readFile(demoOutput, "utf8");
  assert.equal(demo("links", demoOutput).status, 1);
  assert.equal(await readFile(demoOutput, "utf8"), original);
  const exported = demo("links", path.join(directory, "fresh.links.json"));
  assert.equal(exported.status, 0, exported.stderr);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, "fresh.links.json"), "utf8"))
      .merchantReplies,
    manifest.merchantReplies,
  );
  await cp(
    new URL("../../../scripts/", import.meta.url),
    path.join(directory, "scripts"),
    { recursive: true },
  );
  const operations = (args: string[]) =>
    spawnSync(
      process.execPath,
      [path.join(directory, "scripts/merchant-operations.mjs"), ...args],
      {
        cwd: directory,
        env: {
          ...demoEnv,
          SOLAPI_SENDER_NUMBER: undefined,
          RESEND_API_KEY: "re_test_only",
          RESEND_FROM: "Test <test@example.test>",
          EMAIL_VERIFICATION_SECRET:
            "test-email-secret-with-at-least-32-characters",
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
  const output = path.join(directory, "deliveries.json");
  const queried = operations([
    "--action",
    "deliveries",
    "--status",
    "ACCEPTED",
    "--page",
    "1",
    "--output",
    output,
  ]);
  assert.equal(queried.status, 0, queried.stderr);
  assert.match(queried.stdout, /온기홀/);
  assert.match(queried.stdout, /\*\*\*-\*\*\*\*-/);
  assert.doesNotMatch(
    queried.stdout + queried.stderr,
    /01000000004|00000000000|#token=|Demo1234!/,
  );
  const records = JSON.parse(await readFile(output, "utf8"));
  assert(records.length > 0);
  assert(records.every((r: { status: string }) => r.status === "ACCEPTED"));
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  const savedOutput = await readFile(output, "utf8");
  assert.equal(
    operations(["--action", "deliveries", "--page", "1", "--output", output])
      .status,
    1,
  );
  assert.equal(await readFile(output, "utf8"), savedOutput);
  assert.equal(
    operations(["--action", "deliveries", "--status", "NOT_A_STATUS"]).status,
    1,
  );
});
