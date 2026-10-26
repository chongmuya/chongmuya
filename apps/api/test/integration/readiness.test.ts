import assert from "node:assert/strict";
import { test } from "node:test";
import { DataSource } from "typeorm";
import { startTestApplication } from "../support/test-application.js";

test("concurrent readiness initializes PostgreSQL once and shutdown closes the pool", async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert(databaseUrl, "TEST_DATABASE_URL must point to a local or isolated test PostgreSQL database");
  const { app, url } = await startTestApplication(databaseUrl);
  t.after(() => app.close());
  const dataSource = app.get(DataSource);
  assert.equal(dataSource.isInitialized, false);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal(dataSource.isInitialized, false);
  const responses = await Promise.all(Array.from({ length: 6 }, () => fetch(`${url}/ready`)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "chongmuya-api", database: "up" });
  }
  assert.equal(dataSource.isInitialized, true);
  await app.close();
  assert.equal(dataSource.isInitialized, false);
});
