import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startTestApplication } from "../support/test-application.js";
import { DatabaseService } from "../../src/database/database.service.js";

test("additive migration preserves existing account, session and refresh data", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app } = await startTestApplication(process.env.TEST_DATABASE_URL);
  t.after(() => app.close());
  const db = await app.get(DatabaseService).connect();
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    // A fresh transaction-local schema exercises the real migration SQL without
    // reverting migrations or modifying any existing account in the test DB.
    const schema = `upgrade_${randomUUID().replaceAll("-", "")}`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET LOCAL search_path TO ${schema}`);
    const { Authentication1793318400000 } =
      await import("../../src/database/migrations/1793318400000-Authentication.js");
    const { GroupEvents1793664000000 } =
      await import("../../src/database/migrations/1793664000000-GroupEvents.js");
    await new Authentication1793318400000().up(runner);
    const account = randomUUID(),
      session = randomUUID();
    await runner.query("INSERT INTO accounts VALUES ($1, $2, $3, now())", [
      account,
      "existing@example.com",
      "existing-hash",
    ]);
    await runner.query(
      "INSERT INTO auth_sessions VALUES ($1, $2, now() + interval '1 day', null)",
      [session, account],
    );
    await runner.query("INSERT INTO refresh_tokens VALUES ($1, $2, null)", [
      "a".repeat(64),
      session,
    ]);
    const before = await runner.query(
      "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
    );
    await new GroupEvents1793664000000().up(runner);
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
      ),
      before,
    );
    const group = randomUUID();
    await runner.query("INSERT INTO groups VALUES ($1, $2, $3, now())", [
      group,
      account,
      "기존 계정 모임",
    ]);
    await runner.query("INSERT INTO events VALUES ($1, $2, $3, null, now())", [
      randomUUID(),
      group,
      "명단 없는 행사",
    ]);
    assert.equal(
      (await runner.query("SELECT count(*)::int AS count FROM events"))[0]
        .count,
      1,
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
});
