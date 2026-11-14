import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";

test("group onboarding, validation and ownership for two accounts", async (t) => {
  const { call, signup, createGroup } = await startResourceApplication(t);
  const a = await signup();
  const b = await signup();
  assert.deepEqual(await (await call("groups", a)).json(), []);
  assert.equal((await call("groups")).status, 401);
  for (const body of [
    { name: " " },
    { name: "x".repeat(101) },
    { name: "모임", ownerId: randomUUID() },
  ]) {
    assert.equal((await call("groups", a, "POST", body)).status, 400);
  }
  const g1 = await createGroup(" 첫 모임 ", a);
  const g2 = await createGroup("두 번째 모임", a);
  assert.equal(g1.name, "첫 모임");
  assert.deepEqual(
    (await (await call("groups", a)).json())
      .map((g: { id: string }) => g.id)
      .sort(),
    [g1.id, g2.id].sort(),
  );
  for (const [method, body] of [
    ["GET", undefined],
    ["PATCH", { name: "침입" }],
  ] as const)
    assert.equal((await call(`groups/${g1.id}`, b, method, body)).status, 404);
  const rename = await call(`groups/${g1.id}`, a, "PATCH", {
    name: "수정 모임",
  });
  assert.deepEqual(await rename.json(), { id: g1.id, name: "수정 모임" });
  assert.equal((await call(`groups/not-a-uuid`, a)).status, 400);
  assert.deepEqual(await (await call(`groups/${g1.id}`, a)).json(), {
    id: g1.id,
    name: "수정 모임",
  });
  assert.equal((await call(`groups/${randomUUID()}`, a)).status, 404);
  assert.equal((await call("auth/logout", a, "POST")).status, 204);
  assert.equal((await call("groups", a)).status, 401);
});

test("group query failures distinguish unavailability from coding errors and recover", async (t) => {
  const { db, call, signup, logs } = await startResourceApplication(t);
  const { Group } = await import("../../src/modules/groups/group.entity.js");
  const jar = await signup();
  const repository = db.getRepository(Group);
  for (const [error, status, category] of [
    [new TypeError("private-code-bug"), 500, "unexpected"],
    [
      Object.assign(new Error("private-database-host"), { code: "ECONNRESET" }),
      503,
      "database_unavailable",
    ],
  ] as const) {
    const query = t.mock.method(repository, "find", async () => {
      throw error;
    });
    const response = await call("groups", jar);
    assert.equal(response.status, status);
    const body = await response.json();
    const log = logs.find((entry) => entry.requestId === body.requestId);
    assert.equal(log?.failure?.category, category);
    assert.doesNotMatch(JSON.stringify({ body, logs }), /private-|postgresql:/);
    query.mock.restore();
  }
  assert.equal((await call("groups", jar)).status, 200);
});
