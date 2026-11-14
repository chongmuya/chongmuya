import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startTestApplication } from "../support/test-application.js";
import { DatabaseService } from "../../src/database/database.service.js";

test("personal event migration backfills owners without changing existing records and refuses lossy rollback", async (t) => {
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
    const beforeGroups = await runner.query("SELECT * FROM groups");
    const beforeEvents = await runner.query("SELECT * FROM events");
    const { PersonalEvents1794652800000 } =
      await import("../../src/database/migrations/1794652800000-PersonalEvents.js");
    const migration = new PersonalEvents1794652800000();
    await migration.up(runner);
    assert.deepEqual(await runner.query("SELECT * FROM groups"), beforeGroups);
    assert.deepEqual(
      await runner.query("SELECT * FROM events"),
      beforeEvents.map((row: object) => ({
        ...row,
        owner_id: account,
        version: 1,
      })),
    );
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
      ),
      before,
    );
    // Untouched pre-upgrade data can still round-trip without deletion.
    await migration.down(runner);
    assert.deepEqual(await runner.query("SELECT * FROM events"), beforeEvents);
    // A broken legacy reference must abort rather than invent an owner.
    await runner.query("SAVEPOINT incomplete_backfill");
    await runner.query(
      "ALTER TABLE events DROP CONSTRAINT events_group_id_fkey",
    );
    await runner.query("UPDATE events SET group_id = $1", [randomUUID()]);
    await assert.rejects(migration.up(runner), /backfill is incomplete/);
    await runner.query("ROLLBACK TO SAVEPOINT incomplete_backfill");
    await migration.up(runner);
    const personalId = randomUUID();
    await runner.query(
      "INSERT INTO events (id, owner_id, group_id, name, scheduled_at, created_at) VALUES ($1, $2, null, '개인 행사', null, now())",
      [personalId, account],
    );
    for (const linked of [false, true]) {
      if (linked)
        await runner.query(
          "UPDATE events SET group_id = $1, version = 2 WHERE id = $2",
          [group, personalId],
        );
      const data = await runner.query("SELECT * FROM events ORDER BY id");
      await runner.query("SAVEPOINT safe_rollback");
      await assert.rejects(migration.down(runner), /cannot be represented/);
      await runner.query("ROLLBACK TO SAVEPOINT safe_rollback");
      assert.deepEqual(
        await runner.query("SELECT * FROM events ORDER BY id"),
        data,
      );
    }
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
});
