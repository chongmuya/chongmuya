import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { RequestLimitCleanupService } from "../../src/database/request-limit-cleanup.service.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
import { ATTENDANCE_LIMITS } from "../../src/modules/events/attendance.service.js";
import { startResourceApplication } from "../support/resource-application.js";

test("attendance shares one IP budget across rounds and only creates link buckets for valid links", async (t) => {
  const { call, db, signup, url } = await startResourceApplication(t, {
    TRUST_PROXY_HOPS: "1",
  });
  const owner = await signup();
  const event = await call("events", owner, "POST", { name: "공개 출석" });
  assert.equal(event.status, 201);
  const { id } = (await event.json()) as { id: string };
  const createRound = async (title: string) => {
    const response = await call(
      `events/${id}/attendance-rounds`,
      owner,
      "POST",
      {
        title,
        requestKey: randomUUID(),
      },
    );
    assert.equal(response.status, 201);
    return ((await response.json()) as { shareId: string }).shareId;
  };
  const first = await createRound("1차"),
    second = await createRound("2차");
  const clientIp = "192.0.2.21";
  const request = (path: string, body?: object, ip = clientIp) =>
    fetch(`${url}/api/v1/attendance/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Protection": "1",
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
      },
      body: body && JSON.stringify(body),
    });

  const attempts = db.getRepository(AuthAttempt);
  const ipBucket = tokenHash(`attendance:ip:${clientIp}`);
  const linkBucket = (action: string, share: string) =>
    tokenHash(`attendance:${action}:ip:${share}:${clientIp}`);
  await attempts.upsert(
    {
      key: ipBucket,
      count: ATTENDANCE_LIMITS.allIp - 2,
      resetsAt: new Date(Date.now() + 60_000),
    },
    ["key"],
  );
  const missing = randomUUID();
  assert.equal((await request(missing)).status, 404);
  assert.equal(
    await attempts.existsBy({ key: linkBucket("info", missing) }),
    false,
  );
  assert.equal((await request(first)).status, 200);
  assert.equal(
    (await request(`${second}/open`, { name: "참석자", phoneLast4: "1234" }))
      .status,
    429,
  );
  assert.equal(
    (
      await request(`${second}/response`, {
        accessToken: "fixture",
        answer: "ATTENDING",
      })
    ).status,
    429,
  );
  for (const action of ["open", "save"])
    assert.equal(
      await attempts.existsBy({ key: linkBucket(action, second) }),
      false,
    );
  assert.equal(
    (await attempts.findOneByOrFail({ key: ipBucket })).count,
    ATTENDANCE_LIMITS.allIp,
  );
  assert.equal((await request(second, undefined, "192.0.2.22")).status, 200);
  await attempts.update(ipBucket, { resetsAt: new Date(0) });
  assert.equal((await request(second)).status, 200);
  assert.equal((await attempts.findOneByOrFail({ key: ipBucket })).count, 1);
});

test("scheduled cleanup deletes expired buckets and skips active or locked buckets", async (t) => {
  const { app, db } = await startResourceApplication(t);
  const expired = tokenHash(randomUUID()),
    locked = tokenHash(randomUUID()),
    active = tokenHash(randomUUID());
  const attempts = db.getRepository(AuthAttempt);
  await attempts.insert([
    { key: expired, count: 3, resetsAt: new Date(0) },
    { key: locked, count: 3, resetsAt: new Date(0) },
    { key: active, count: 3, resetsAt: new Date(Date.now() + 60_000) },
  ]);
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query(
      "SELECT key FROM auth_attempts WHERE key = $1 FOR UPDATE",
      [locked],
    );
    const cleanup = app.get(RequestLimitCleanupService);
    t.mock.timers.enable({ apis: ["setInterval"] });
    cleanup.start();
    t.mock.timers.tick(60_000);
    await cleanup.onModuleDestroy();
    assert.equal(await attempts.existsBy({ key: expired }), false);
    assert.equal(await attempts.existsBy({ key: locked }), true);
    assert.equal((await attempts.findOneByOrFail({ key: active })).count, 3);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
});
