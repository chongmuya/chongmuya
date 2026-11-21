import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type {
  ParticipantDto,
  PublicAttendanceAccess,
  RoundDetailDto,
} from "../../src/modules/events/dto/response/attendance.response.dto.js";
import { startResourceApplication } from "../support/resource-application.js";

async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
}

test("round rosters copy membership and preserve attendance and historical settlement references on removal", async (t) => {
  const { call, signup, url } = await startResourceApplication(t);
  const owner = await signup();
  const other = await signup();
  const group = await json<{ id: string }>(
    await call("groups", owner, "POST", {
      name: "모임 명단과 차수",
      creationKey: randomUUID(),
      members: [{ name: "모임 구성원", phoneLast4: "0046" }],
    }),
    201,
  );
  const event = await json<{ id: string }>(
    await call("events", owner, "POST", {
      name: "차수별 명단",
      groupId: group.id,
    }),
    201,
  );
  const base = `events/${event.id}`;
  const participants = `${base}/participants`;
  const rounds = `${base}/attendance-rounds`;
  const roster = async (roundId?: string) =>
    json<ParticipantDto[]>(
      await call(
        `${participants}${roundId ? `?roundId=${roundId}` : ""}`,
        owner,
      ),
    );
  const createRound = async (title: string) =>
    json<RoundDetailDto>(
      await call(rounds, owner, "POST", { requestKey: randomUUID(), title }),
      201,
    );
  const remove = (
    person: ParticipantDto,
    roundId: string,
    version = person.version,
  ) =>
    call(`${participants}/${person.id}?roundId=${roundId}`, owner, "DELETE", {
      expectedVersion: version,
    });

  await json(
    await call(participants, owner, "POST", {
      requestKey: randomUUID(),
      members: [
        { name: "기본 참석자", phoneLast4: "0012" },
        { name: "정산 부담자", phoneLast4: "0013" },
        { name: "명단 수정 대상", phoneLast4: "0014" },
      ],
    }),
    201,
  );
  const [attendee, payer, edit] = await roster();
  assert(attendee && payer && edit);
  const first = await createRound("1차");
  const second = await createRound("2차");
  assert.deepEqual(
    second.participants.map(({ id }) => id),
    first.participants.map(({ id }) => id),
  );

  const added = {
    requestKey: randomUUID(),
    members: [{ name: "차수 추가 대상", phoneLast4: "0045" }],
  };
  const addInRound = (roundId: string) =>
    call(`${participants}?roundId=${roundId}`, owner, "POST", added);
  assert.deepEqual(await json(await addInRound(second.id), 201), {
    addedCount: 1,
  });
  assert.deepEqual(await json(await addInRound(second.id), 201), {
    addedCount: 1,
  });
  assert.equal((await addInRound(first.id)).status, 409);
  const addedPerson = (await roster(second.id)).find(
    ({ name }) => name === "차수 추가 대상",
  )!;
  assert(addedPerson);
  assert(!(await roster(first.id)).some(({ id }) => id === addedPerson.id));
  const open = async (round: RoundDetailDto) =>
    json<PublicAttendanceAccess>(
      await call(`attendance/${round.shareId}/open`, "", "POST", {
        name: addedPerson.name,
        phoneLast4: addedPerson.phoneLast4,
      }),
    );
  assert.equal((await open(first)).kind, "REVIEW");
  const secondAccess = await open(second);
  assert.equal(secondAccess.kind, "DIRECT");

  const preflight = await fetch(
    `${url}/api/v1/${participants}/${addedPerson.id}?roundId=${second.id}`,
    {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "content-type,x-csrf-protection",
      },
    },
  );
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.match(
    preflight.headers.get("access-control-allow-methods") ?? "",
    /DELETE/,
  );
  assert.equal(
    (
      await call(
        `${participants}/${addedPerson.id}?roundId=${second.id}`,
        other,
        "DELETE",
        { expectedVersion: 1 },
      )
    ).status,
    404,
  );
  assert.equal((await remove(addedPerson, randomUUID())).status, 404);
  assert.equal((await remove(addedPerson, second.id, 2)).status, 409);
  assert.equal((await remove(addedPerson, second.id)).status, 204);
  assert.equal((await remove(addedPerson, second.id)).status, 204);
  assert.equal(
    (
      await call(`attendance/${second.shareId}/response`, "", "POST", {
        accessToken: secondAccess.accessToken,
        answer: "ATTENDING",
      })
    ).status,
    409,
  );

  await json(
    await call(`${rounds}/${first.id}/responses/${attendee.id}`, owner, "PUT", {
      expectedVersion: 0,
      managerOverride: "ATTENDING",
    }),
  );
  assert.equal(
    (await json<{ code: string }>(await remove(attendee, first.id), 409)).code,
    "ATTENDANCE_PARTICIPANT_HAS_RECORDS",
  );
  assert.equal((await remove(attendee, second.id)).status, 204);
  const third = await createRound("3차");
  assert.deepEqual(
    third.participants.map(({ id }) => id),
    [payer.id, edit.id],
  );
  assert.deepEqual(third.counts, {
    attending: 0,
    absent: 0,
    unanswered: 2,
    pending: 0,
  });

  const expense = {
    action: "EXPENSE",
    id: randomUUID(),
    roundId: second.id,
    name: "식사",
    total: 10000,
    deposit: 0,
    includeDeposit: true,
    support: 0,
    reservationId: null,
    memo: "",
    remainder: null,
    fileIds: [],
  };
  for (const [expectedVersion, person] of [payer, edit].entries())
    await json(
      await call(`${base}/settlement`, owner, "POST", {
        command: {
          ...expense,
          requestKey: randomUUID(),
          expectedVersion,
          payers: [{ id: person.id, version: person.version }],
        },
      }),
    );
  assert.equal(
    (await json<{ code: string }>(await remove(payer, second.id), 409)).code,
    "ATTENDANCE_PARTICIPANT_HAS_RECORDS",
  );
  assert.equal((await remove(payer, first.id)).status, 204);

  await json(
    await call(
      `${participants}/${edit.id}?roundId=${second.id}`,
      owner,
      "PATCH",
      {
        expectedVersion: edit.version,
        name: "공통 정보 수정",
        phoneLast4: edit.phoneLast4,
      },
    ),
  );
  assert.equal(
    (await roster(first.id)).find(({ id }) => id === edit.id)?.name,
    "공통 정보 수정",
  );
  const all = await roster();
  await json(
    await call(`${participants}?roundId=${second.id}`, owner, "POST", {
      requestKey: randomUUID(),
      expectedRoster: all.map(({ id, version }) => ({ id, version })),
      members: [
        {
          name: addedPerson.name,
          phoneLast4: addedPerson.phoneLast4,
          existingParticipantId: addedPerson.id,
        },
      ],
    }),
    201,
  );
  assert((await roster(second.id)).some(({ id }) => id === addedPerson.id));
  assert(!(await roster(third.id)).some(({ id }) => id === addedPerson.id));

  const [member] = await json<{ id: string; version: number }[]>(
    await call(`groups/${group.id}/members`, owner),
  );
  assert(member);
  assert.deepEqual(
    await json(
      await call(
        `${participants}/import-group/selected?roundId=${second.id}`,
        owner,
        "POST",
        {
          requestKey: randomUUID(),
          members: [{ id: member.id, version: member.version }],
        },
      ),
      201,
    ),
    { addedCount: 1 },
  );
  assert(
    !(await roster(first.id)).some(
      ({ groupMemberId }) => groupMemberId === member.id,
    ),
  );
  assert.deepEqual(
    await json(
      await call(
        `${participants}/import-group?roundId=${first.id}`,
        owner,
        "POST",
      ),
      201,
    ),
    { addedCount: 1 },
  );
  const imported = await roster(second.id);
  assert.equal(
    (await roster(first.id)).find(
      ({ groupMemberId }) => groupMemberId === member.id,
    )?.id,
    imported.find(({ groupMemberId }) => groupMemberId === member.id)?.id,
  );
  assert(
    !(await roster(third.id)).some(
      ({ groupMemberId }) => groupMemberId === member.id,
    ),
  );
});
