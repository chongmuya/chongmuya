import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import type { ParticipantDto } from "../../src/modules/events/dto/response/attendance.response.dto.js";
import { EventRosterAddition } from "../../src/modules/events/entities/event-roster-addition.entity.js";
import { NotificationFact } from "../../src/modules/notifications/entities/notification.entity.js";

async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
}

test("mixed import commits selected IDs and direct people once, preserves existing identities and replays the original request after source edits", async (t) => {
  const { call, signup, db } = await startResourceApplication(t);
  const owner = await signup(),
    stranger = await signup();
  const group = await json<{ id: string }>(
    await call("groups", owner, "POST", {
      name: "혼합 저장 모임",
      members: [
        { name: "선택한 사람", phoneLast4: "0012" },
        { name: "선택하지 않은 사람" },
      ],
    }),
    201,
  );
  const source = await json<{ id: string; version: number; name: string }[]>(
    await call(`groups/${group.id}/members`, owner),
  );
  const event = await json<{ id: string }>(
    await call("events", owner, "POST", {
      name: "혼합 저장 행사",
      groupId: group.id,
    }),
    201,
  );
  const base = `events/${event.id}/participants`,
    endpoint = `${base}/import-group/selected`;
  await json(
    await call(base, owner, "POST", {
      requestKey: randomUUID(),
      members: [{ name: "기존 사람", phoneLast4: "0100", label: "운영" }],
    }),
    201,
  );
  const before = await json<ParticipantDto[]>(await call(base, owner));
  const existing = before[0];
  const command = {
    requestKey: randomUUID(),
    members: [{ id: source[0].id, version: source[0].version }],
    directMembers: [
      {
        name: existing.name,
        phoneLast4: existing.phoneLast4,
        label: existing.label,
        existingParticipantId: existing.id,
      },
      { name: "직접 추가", phoneLast4: "0007", label: null },
    ],
    expectedRoster: before.map(({ id, version }) => ({ id, version })),
    duplicatesConfirmed: false,
  };
  assert.equal((await call(endpoint, stranger, "POST", command)).status, 404);
  const responses = await Promise.all([
    call(endpoint, owner, "POST", command),
    call(endpoint, owner, "POST", command),
  ]);
  for (const response of responses)
    assert.deepEqual(await json(response, 201), { addedCount: 2 });
  const after = await json<ParticipantDto[]>(await call(base, owner));
  assert.equal(after.length, 3);
  assert.deepEqual(
    after.find((row) => row.id === existing.id),
    existing,
  );
  assert.equal(
    after.find((row) => row.groupMemberId === source[0].id)?.phoneLast4,
    "0012",
  );
  assert.equal(
    after.find((row) => row.name === "직접 추가")?.groupMemberId,
    null,
  );
  assert(!after.some((row) => row.groupMemberId === source[1].id));
  await json(
    await call(`groups/${group.id}/members/${source[0].id}`, owner, "PATCH", {
      name: "변경된 원본",
      phoneLast4: "1111",
      label: null,
      expectedVersion: 1,
      exclude: false,
      requestKey: randomUUID(),
    }),
  );
  assert.deepEqual(
    await json(await call(endpoint, owner, "POST", command), 201),
    { addedCount: 2 },
  );
  assert.equal(
    (
      await call(endpoint, owner, "POST", {
        ...command,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(endpoint, owner, "POST", {
        ...command,
        directMembers: [{ name: "달라진 요청" }],
      })
    ).status,
    409,
  );
  assert.deepEqual(await json(await call(base, owner)), after);
  assert.equal(
    await db
      .getRepository(EventRosterAddition)
      .countBy({ eventId: event.id, requestKey: command.requestKey }),
    1,
  );
  // An empty selection is valid only when direct additions are supplied.
  assert.deepEqual(
    await json(
      await call(endpoint, owner, "POST", {
        requestKey: randomUUID(),
        members: [],
        directMembers: [{ name: "직접 입력만", phoneLast4: "0000" }],
        expectedRoster: after.map(({ id, version }) => ({ id, version })),
      }),
      201,
    ),
    { addedCount: 1 },
  );
});

test("namesakes selected in the same mixed request require explicit new-person confirmation and every failed batch rolls back copies and receipts", async (t) => {
  const { call, signup, db } = await startResourceApplication(t);
  const owner = await signup();
  const group = await json<{ id: string }>(
    await call("groups", owner, "POST", {
      name: "동명이인 모임",
      members: [{ name: "동명이인", phoneLast4: "0012" }],
    }),
    201,
  );
  const [source] = await json<{ id: string; version: number }[]>(
    await call(`groups/${group.id}/members`, owner),
  );
  const event = await json<{ id: string }>(
    await call("events", owner, "POST", {
      name: "전부 저장 또는 취소",
      groupId: group.id,
    }),
    201,
  );
  const base = `events/${event.id}/participants`,
    endpoint = `${base}/import-group/selected`;
  const command = {
    requestKey: randomUUID(),
    members: [{ id: source.id, version: source.version }],
    directMembers: [{ name: "동명이인", phoneLast4: "0012" }],
    expectedRoster: [],
  };
  const notificationsBefore = await db
    .getRepository(NotificationFact)
    .countBy({ eventId: event.id });
  const failed = await call(endpoint, owner, "POST", command);
  assert.equal(failed.status, 400);
  assert.equal(
    ((await failed.json()) as { code: string }).code,
    "ROSTER_DUPLICATES_UNCONFIRMED",
  );
  assert.deepEqual(await json(await call(base, owner)), []);
  assert.equal(
    await db.getRepository(EventRosterAddition).countBy({ eventId: event.id }),
    0,
  );
  assert.equal(
    await db.getRepository(NotificationFact).countBy({ eventId: event.id }),
    notificationsBefore,
  );
  // The source copy occurs before direct validation; a stale snapshot still rolls it back.
  assert.equal(
    (
      await call(endpoint, owner, "POST", {
        ...command,
        expectedRoster: [{ id: randomUUID(), version: 1 }],
        directMembers: [
          { ...command.directMembers[0], newPersonConfirmed: true },
        ],
        duplicatesConfirmed: true,
      })
    ).status,
    409,
  );
  assert.deepEqual(await json(await call(base, owner)), []);
  for (const body of [
    { ...command, members: [], directMembers: [] },
    { ...command, directMembers: null },
    { ...command, directMembers: [null] },
    { ...command, directMembers: [{ name: "01012340012" }] },
    { ...command, members: null },
  ])
    assert.equal((await call(endpoint, owner, "POST", body)).status, 400);
  // Reusing a failed request key is safe because no receipt survived the rollback.
  const confirmed = {
    ...command,
    directMembers: [{ ...command.directMembers[0], newPersonConfirmed: true }],
    duplicatesConfirmed: true,
  };
  assert.deepEqual(
    await json(await call(endpoint, owner, "POST", confirmed), 201),
    { addedCount: 2 },
  );
  assert.deepEqual(
    await json(await call(endpoint, owner, "POST", confirmed), 201),
    { addedCount: 2 },
  );
  const after = await json<ParticipantDto[]>(await call(base, owner));
  assert.equal(after.length, 2);
  assert.equal(
    after.filter((row) => row.groupMemberId === source.id).length,
    1,
  );
  assert.equal(after.filter((row) => row.groupMemberId === null).length, 1);
  assert.equal(
    await db.getRepository(NotificationFact).countBy({ eventId: event.id }),
    notificationsBefore + 1,
  );
});

test("the combined 500-person limit rejects an entire mixed import while the existing add and whole-import APIs remain usable", async (t) => {
  const { call, signup, db } = await startResourceApplication(t);
  const owner = await signup();
  const group = await json<{ id: string }>(
    await call("groups", owner, "POST", {
      name: "혼합 인원 제한",
      members: [{ name: "모임 사람" }],
    }),
    201,
  );
  const [source] = await json<{ id: string; version: number }[]>(
    await call(`groups/${group.id}/members`, owner),
  );
  const event = await json<{ id: string }>(
    await call("events", owner, "POST", {
      name: "합계 제한",
      groupId: group.id,
    }),
    201,
  );
  const base = `events/${event.id}/participants`;
  await json(
    await call(base, owner, "POST", {
      requestKey: randomUUID(),
      members: Array.from({ length: 499 }, (_, i) => ({ name: `참여자${i}` })),
    }),
    201,
  );
  const before = await json<ParticipantDto[]>(await call(base, owner));
  const key = randomUUID();
  assert.equal(
    (
      await call(`${base}/import-group/selected`, owner, "POST", {
        requestKey: key,
        members: [{ id: source.id, version: source.version }],
        directMembers: [{ name: "직접 사람" }],
        expectedRoster: before.map(({ id, version }) => ({ id, version })),
      })
    ).status,
    400,
  );
  assert.deepEqual(await json(await call(base, owner)), before);
  assert.equal(
    await db
      .getRepository(EventRosterAddition)
      .countBy({ eventId: event.id, requestKey: key }),
    0,
  );
  assert.deepEqual(
    await json(await call(`${base}/import-group`, owner, "POST"), 201),
    { addedCount: 1 },
  );
  assert.equal(
    (await json<ParticipantDto[]>(await call(base, owner))).length,
    500,
  );
});
