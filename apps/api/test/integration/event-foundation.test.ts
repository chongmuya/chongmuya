import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { Event } from "../../src/modules/events/entities/event.entity.js";
import { EventParticipant } from "../../src/modules/events/entities/event-participant.entity.js";
import type {
  ParticipantDto,
  RoundDetailDto,
} from "../../src/modules/events/dto/response/attendance.response.dto.js";
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};
test("event creation receipts and explicit roster identity choices preserve participants and answers", async (t) => {
  const { call, signup, db } = await startResourceApplication(t),
    a = await signup(),
    b = await signup();
  const group = await json<{ id: string }>(
    await call("groups", a, "POST", {
      name: "명단 복사",
      members: [{ name: "김민수", phoneLast4: "1234" }],
    }),
    201,
  );
  const creationKey = randomUUID(),
    input = {
      creationKey,
      name: "행사 한 번",
      groupId: group.id,
      importGroupRoster: true,
    };
  const outcomes = await Promise.all([
    call("events", a, "POST", input),
    call("events", a, "POST", input),
  ]);
  const event = await json<{ id: string; version: number }>(outcomes[0], 201),
    same = await json<{ id: string }>(outcomes[1], 201);
  assert.equal(event.id, same.id);
  assert.equal(await db.manager.countBy(Event, { creationKey }), 1);
  assert.equal(
    await db.manager.countBy(EventParticipant, { eventId: event.id }),
    1,
  );
  assert.equal(
    (await json<{ id: string }>(await call("events", a, "POST", input), 201))
      .id,
    event.id,
  );
  assert.equal(
    (await call("events", a, "POST", { ...input, name: "다른 행사" })).status,
    409,
  );
  const other = await json<{ id: string }>(
    await call("events", b, "POST", { creationKey, name: "다른 계정" }),
    201,
  );
  assert.notEqual(event.id, other.id);
  const base = `events/${event.id}`,
    list = () =>
      call(`${base}/participants`, a).then((r) => json<ParticipantDto[]>(r));
  const original = await list(),
    person = original[0];
  const round = await json<RoundDetailDto>(
    await call(`${base}/attendance-rounds`, a, "POST", {
      title: "1차",
      requestKey: randomUUID(),
    }),
    201,
  );
  const overridden = await call(
    `${base}/attendance-rounds/${round.id}/responses/${person.id}`,
    a,
    "PUT",
    { expectedVersion: 0, managerOverride: "ATTENDING" },
  );
  assert.equal(overridden.status, 200);
  const add = {
    requestKey: randomUUID(),
    expectedRoster: original.map(({ id, version }) => ({ id, version })),
    members: [
      {
        name: person.name,
        phoneLast4: person.phoneLast4,
        label: person.label,
        existingParticipantId: person.id,
      },
    ],
  };
  assert.deepEqual(
    await json(await call(`${base}/participants`, a, "POST", add), 201),
    { addedCount: 0 },
  );
  assert.deepEqual(await list(), original);
  const duplicate = {
    ...add,
    requestKey: randomUUID(),
    duplicatesConfirmed: true,
    members: [
      {
        name: person.name,
        phoneLast4: person.phoneLast4,
        newPersonConfirmed: true,
      },
    ],
  };
  assert.deepEqual(
    await json(await call(`${base}/participants`, a, "POST", duplicate), 201),
    { addedCount: 1 },
  );
  assert.equal((await list()).length, 2);
  assert.equal(
    (
      await call(`${base}/participants`, a, "POST", {
        ...duplicate,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.deepEqual(
    await json(await call(`${base}/participants`, a, "POST", duplicate), 201),
    { addedCount: 1 },
  );
  assert.equal(
    (
      await call(`events/${other.id}/participants`, b, "POST", {
        ...add,
        requestKey: randomUUID(),
        expectedRoster: [],
      })
    ).status,
    409,
  );
  const detail = await json<RoundDetailDto>(
    await call(`${base}/attendance-rounds/${round.id}`, a),
  );
  assert.equal(
    detail.participants.find((p) => p.id === person.id)!.response.finalState,
    "ATTENDING",
  );
  const access = await json<{ kind: string }>(
    await call(`attendance/${round.shareId}/open`, "", "POST", {
      name: person.name,
      phoneLast4: "1234",
    }),
  );
  assert.equal(access.kind, "REVIEW");
  const roster = await list(),
    fresh = {
      requestKey: randomUUID(),
      expectedRoster: roster.map(({ id, version }) => ({ id, version })),
      members: [{ name: "새 사람" }],
    };
  const races = await Promise.all([
    call(`${base}/participants`, a, "POST", fresh),
    call(`${base}/participants`, a, "POST", {
      ...fresh,
      requestKey: randomUUID(),
      members: [{ name: "또 다른 사람" }],
    }),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
});
