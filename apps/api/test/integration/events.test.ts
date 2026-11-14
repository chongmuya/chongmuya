import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import { startResourceApplication } from "../support/resource-application.js";

test("event contract and isolation across accounts and groups", async (t) => {
  const { call, signup, createGroup } = await startResourceApplication(t);
  const a = await signup();
  const b = await signup();
  const g1 = await createGroup("첫 모임", a);
  const g2 = await createGroup("두 번째 모임", a);
  const other = await createGroup("타인 모임", b);
  const events = `groups/${g1.id}/events`;
  const created = await call(events, a, "POST", { name: "명단 없는 행사" });
  assert.equal(created.status, 201);
  const event = await created.json();
  assert.equal(event.groupId, g1.id);
  assert.equal(event.scheduledAt, null);
  assert.deepEqual(await (await call(events, a)).json(), [event]);
  assert.deepEqual(await (await call(`groups/${g2.id}/events`, a)).json(), []);
  assert.deepEqual(
    await (await call(`${events}/${event.id}`, a)).json(),
    event,
  );
  assert.equal(
    (await call(`groups/${g2.id}/events/${event.id}`, a)).status,
    404,
  );
  for (const [path, method, body] of [
    [events, "GET", undefined],
    [events, "POST", { name: "침입" }],
    [`${events}/${event.id}`, "GET", undefined],
  ] as const)
    assert.equal((await call(path, b, method, body)).status, 404);
  assert.equal(
    (await call(`groups/${other.id}/events`, a, "POST", { name: "침입" }))
      .status,
    404,
  );
  assert.equal(
    (await call(events, a, "POST", { name: "침입", groupId: other.id })).status,
    400,
  );
  assert.equal(
    (
      await call(events, a, "POST", {
        name: "날짜 오류",
        scheduledAt: "2026-02-30T10:00:00+09:00",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(events, a, "POST", {
        name: "시간대 없음",
        scheduledAt: "2026-11-03T10:00:00",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(events, a, "POST", {
        name: "일정 행사",
        scheduledAt: "2026-11-03T10:00:00+09:00",
      })
    ).status,
    201,
  );
  assert.equal((await call(events)).status, 401);
  assert.equal((await call(`groups/not-a-uuid/events`, a)).status, 400);
  assert.equal((await call(`${events}/not-a-uuid`, a)).status, 400);
  assert.equal((await call(`${events}/${randomUUID()}`, a)).status, 404);
  for (const body of [{ name: " " }, { name: "x".repeat(101) }, { name: 7 }])
    assert.equal((await call(events, a, "POST", body)).status, 400);
  const explicitNull = await call(events, a, "POST", {
    name: " 공백 제거 ",
    scheduledAt: null,
  });
  assert.equal(explicitNull.status, 201);
  assert.equal(explicitNull.headers.get("cache-control"), "no-store");
  const result = await explicitNull.json();
  assert.deepEqual(Object.keys(result).sort(), [
    "groupId",
    "id",
    "name",
    "scheduledAt",
  ]);
  assert.equal(result.name, "공백 제거");
  assert.equal(result.scheduledAt, null);
  assert.equal((await call("auth/logout", a, "POST")).status, 204);
  assert.equal((await call(events, a)).status, 401);
});

test("EventsModule uses the exported GroupsService with the event transaction manager", async (t) => {
  const { app, db, call, signup, createGroup } =
    await startResourceApplication(t);
  const { GroupsService } =
    await import("../../src/modules/groups/groups.service.js");
  const { Event } =
    await import("../../src/modules/events/entities/event.entity.js");
  const groups = app.get(GroupsService);
  const original = groups.assertOwned.bind(groups);
  const authorize = t.mock.method(
    groups,
    "assertOwned",
    async (ownerId: string, groupId: string, manager: EntityManager) => {
      assert.notEqual(manager, db.manager);
      assert.equal(manager.queryRunner?.isTransactionActive, true);
      await original(ownerId, groupId, manager);
    },
  );
  const jar = await signup();
  const group = await createGroup("트랜잭션 모임", jar);
  const response = await call(`groups/${group.id}/events`, jar, "POST", {
    name: "행사",
  });
  assert.equal(response.status, 201);
  assert.equal(authorize.mock.callCount(), 1);
  assert.equal(await db.getRepository(Event).countBy({ groupId: group.id }), 1);
});
