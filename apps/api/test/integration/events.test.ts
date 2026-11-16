import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import { startResourceApplication } from "../support/resource-application.js";
import { Event } from "../../src/modules/events/entities/event.entity.js";

test("personal events work without groups and event ownership is enforced for every command", async (t) => {
  const { call, signup, createGroup, db, logs } =
    await startResourceApplication(t);
  const a = await signup(),
    b = await signup();
  const owner = await (await call("auth/me", a)).json();
  const made = await call("events", a, "POST", {
    name: " 개인 행사 ",
    scheduledAt: "2026-11-15T18:30:00+09:00",
  });
  assert.equal(made.status, 201);
  const event = await made.json();
  assert.equal(event.ownerId, owner.id);
  assert.equal(event.groupId, null);
  assert.equal(event.name, "개인 행사");
  assert.equal(event.version, 1);
  assert.equal(event.scheduledAt, "2026-11-15T09:30:00.000Z");
  assert.deepEqual(await (await call("groups", a)).json(), []);
  assert.deepEqual(await (await call("events", a)).json(), [event]);
  assert.deepEqual(await (await call(`events/${event.id}`, a)).json(), event);
  const ownGroup = await createGroup("내 모임", a),
    otherGroup = await createGroup("타인 모임", b);
  const linkedCreate = await call("events", a, "POST", {
    name: "모임 행사",
    groupId: ownGroup.id,
  });
  assert.equal(linkedCreate.status, 201);
  const linked = await linkedCreate.json();
  assert.equal(linked.ownerId, owner.id);
  assert.deepEqual(
    await (await call(`events?groupId=${ownGroup.id}`, a)).json(),
    [linked],
  );
  assert.equal((await (await call("events", a)).json()).length, 2);
  assert.equal(
    (await call("events", a, "POST", { name: "침입", groupId: otherGroup.id }))
      .status,
    404,
  );
  assert.equal((await call(`events?groupId=${otherGroup.id}`, a)).status, 404);
  for (const id of [event.id, randomUUID()]) {
    for (const [suffix, method, body] of [
      ["", "GET", undefined],
      ["", "PATCH", { name: "침입", expectedVersion: 1 }],
      ["/group", "PUT", { groupId: otherGroup.id, expectedVersion: 1 }],
    ] as const)
      assert.equal(
        (await call(`events/${id}${suffix}`, b, method, body)).status,
        404,
      );
  }
  assert.equal(
    (
      await call(`events/${event.id}/group`, a, "PUT", {
        groupId: otherGroup.id,
        expectedVersion: 1,
      })
    ).status,
    404,
  );
  for (const body of [
    { name: " ", password: "private-input" },
    { name: "x".repeat(101) },
    { name: 7 },
    { name: "행사", ownerId: owner.id },
    { name: "행사", version: 50 },
    { name: "행사", groupId: "private-value" },
    { name: "행사", scheduledAt: "2026-02-30T10:00:00+09:00" },
    { name: "행사", scheduledAt: "2026-11-03T10:00:00" },
  ]) {
    const response = await call("events", a, "POST", body);
    assert.equal(response.status, 400);
    const error = await response.json();
    assert.equal(error.code, "VALIDATION_FAILED");
    assert.doesNotMatch(
      JSON.stringify(error),
      /private-|target|stack|constraints/,
    );
  }
  const fields = await (
    await call("events", a, "POST", {
      name: "",
      scheduledAt: "bad",
      groupId: "bad",
    })
  ).json();
  assert.deepEqual(
    fields.fieldErrors.map((e: { field: string }) => e.field).sort(),
    ["groupId", "name", "scheduledAt"],
  );
  for (const field of ["ownerId", "groupId", "version"]) {
    assert.equal(
      (
        await call(`events/${event.id}`, a, "PATCH", {
          expectedVersion: 1,
          [field]: ownGroup.id,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await call(`events/${event.id}`, a, "PATCH", {
        name: null,
        expectedVersion: 1,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`events/${event.id}`, a, "PATCH", {
        name: "수정",
        expectedVersion: "1",
      })
    ).status,
    400,
  );
  const updated = await call(`events/${event.id}`, a, "PATCH", {
    name: "수정",
    expectedVersion: 1,
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), {
    ...event,
    name: "수정",
    version: 2,
  });
  assert.equal(
    (
      await call(`events/${event.id}`, a, "PATCH", {
        name: "오래된 수정",
        expectedVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("events", a, "POST", {
        name: "이름만",
        groupId: null,
        scheduledAt: null,
      })
    ).status,
    201,
  );
  assert.equal((await call("events?groupId=bad", a)).status, 400);
  assert.equal((await call("events?ownerId=private-input", a)).status, 400);
  assert.equal((await call("events/not-a-uuid", a)).status, 400);
  assert.equal((await call(`groups/${ownGroup.id}/events`, a)).status, 404);
  assert.equal((await call("events")).status, 401);
  // Even a group's owner cannot see somebody else's event by group filtering.
  const bOwner = await (await call("auth/me", b)).json();
  await db.getRepository(Event).update(linked.id, { ownerId: bOwner.id });
  assert.deepEqual(
    await (await call(`events?groupId=${ownGroup.id}`, a)).json(),
    [],
  );
  assert.equal((await call(`events/${linked.id}`, a)).status, 404);
  assert.equal((await call(`events/${linked.id}`, b)).status, 200);
  assert.equal((await call("auth/logout", a, "POST")).status, 204);
  assert.equal((await call("events", a)).status, 401);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /private-input|private-value|group-events/,
  );
});

test("linking locks one event, checks version and preserves all existing event data", async (t) => {
  const { call, signup, createGroup, db } = await startResourceApplication(t);
  const jar = await signup();
  const g1 = await createGroup("첫 모임", jar),
    g2 = await createGroup("다른 모임", jar);
  const event = await (
    await call("events", jar, "POST", {
      name: "연결 전 기록",
      scheduledAt: "2026-11-15T12:00:00Z",
    })
  ).json();
  const before = await db
    .getRepository(Event)
    .findOneByOrFail({ id: event.id });
  const stale = await call(`events/${event.id}/group`, jar, "PUT", {
    groupId: g1.id,
    expectedVersion: 2,
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "VERSION_CONFLICT");
  const responses = await Promise.all(
    [g1, g2].map((group) =>
      call(`events/${event.id}/group`, jar, "PUT", {
        groupId: group.id,
        expectedVersion: 1,
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  const winner = await responses
    .find((response) => response.status === 200)!
    .json();
  const loser = await responses
    .find((response) => response.status === 409)!
    .json();
  assert.equal(loser.code, "VERSION_CONFLICT");
  const after = await db.getRepository(Event).findOneByOrFail({ id: event.id });
  assert.deepEqual(
    { ...after },
    { ...before, groupId: winner.groupId, version: 2 },
  );
  assert.deepEqual(
    await (await call(`events/${event.id}`, jar)).json(),
    winner,
  );
  const other = winner.groupId === g1.id ? g2.id : g1.id;
  for (const groupId of [other, winner.groupId]) {
    const blocked = await call(`events/${event.id}/group`, jar, "PUT", {
      groupId,
      expectedVersion: 2,
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, "EVENT_ALREADY_LINKED");
  }
  assert.equal(
    (
      await call(`events/${event.id}/group`, jar, "PUT", {
        groupId: null,
        expectedVersion: 2,
      })
    ).status,
    400,
  );
  assert.equal(
    (await (await call(`events?groupId=${winner.groupId}`, jar)).json()).length,
    1,
  );
  assert.deepEqual(
    await (await call(`events?groupId=${other}`, jar)).json(),
    [],
  );
});

test("event creation and linking use the exported GroupsService with the same transactional manager", async (t) => {
  const { app, db, call, signup, createGroup } =
    await startResourceApplication(t);
  const { GroupsService } =
    await import("../../src/modules/groups/groups.service.js");
  const groups = app.get(GroupsService),
    original = groups.assertOwned.bind(groups);
  const authorize = t.mock.method(
    groups,
    "assertOwned",
    async (ownerId: string, groupId: string, manager: EntityManager) => {
      assert.notEqual(manager, db.manager);
      assert.equal(manager.queryRunner?.isTransactionActive, true);
      await original(ownerId, groupId, manager);
    },
  );
  const jar = await signup(),
    group = await createGroup("모임", jar);
  assert.equal(
    (await call("events", jar, "POST", { name: "행사", groupId: group.id }))
      .status,
    201,
  );
  const event = await (
    await call("events", jar, "POST", { name: "개인 행사" })
  ).json();
  assert.equal(
    (
      await call(`events/${event.id}/group`, jar, "PUT", {
        groupId: group.id,
        expectedVersion: 1,
      })
    ).status,
    200,
  );
  assert.equal(authorize.mock.callCount(), 2);
});
