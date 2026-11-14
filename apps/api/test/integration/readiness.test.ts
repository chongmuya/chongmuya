import assert from "node:assert/strict";
import { test } from "node:test";
import { DataSource } from "typeorm";
import { startTestApplication } from "../support/test-application.js";

test("concurrent readiness initializes PostgreSQL once and shutdown closes the pool", async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert(
    databaseUrl,
    "TEST_DATABASE_URL must point to a local or isolated test PostgreSQL database",
  );
  const { app, url } = await startTestApplication(databaseUrl);
  t.after(() => app.close());
  const dataSource = app.get(DataSource);
  assert.equal(dataSource.isInitialized, false);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal(dataSource.isInitialized, false);
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => fetch(`${url}/ready`)),
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "chongmuya-api",
      database: "up",
    });
  }
  assert.equal(dataSource.isInitialized, true);
  await app.close();
  assert.equal(dataSource.isInitialized, false);
});

test("database disconnects preserve liveness and recover without restarting the app", async (t) => {
  const { createServer, connect } = await import("node:net");
  const sockets = new Set<import("node:net").Socket>();
  assert(process.env.TEST_DATABASE_URL);
  const target = new URL(process.env.TEST_DATABASE_URL);
  const upstreamAddress = {
    host: target.hostname,
    port: Number(target.port || 5432),
  };
  let available = false;
  // This proxy disrupts only this test's sockets, never the database or another client.
  const proxy = createServer((client) => {
    if (!available) {
      client.destroy();
      return;
    }
    const upstream = connect(upstreamAddress);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("error", () => {
        client.destroy();
        upstream.destroy();
      });
      socket.on("close", () => sockets.delete(socket));
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  assert(address && typeof address !== "string");
  target.hostname = "127.0.0.1";
  target.port = String(address.port);
  const { app, url, logs } = await startTestApplication(target.toString());
  t.after(async () => {
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });
  const ready = () => fetch(`${url}/ready`);
  const live = () => fetch(`${url}/health`);
  assert.equal((await live()).status, 200);
  assert.equal((await ready()).status, 503);
  available = true;
  assert.equal((await ready()).status, 200);
  available = false;
  for (const socket of sockets) socket.destroy();
  assert.equal((await live()).status, 200);
  assert.equal((await ready()).status, 503);
  available = true;
  assert.equal((await ready()).status, 200);
  assert(
    logs.some((entry) => entry.failure?.category === "database_unavailable"),
  );
  assert.doesNotMatch(JSON.stringify(logs), /postgresql:|architecture-test/);
});
