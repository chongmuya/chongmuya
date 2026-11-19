import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import type {
  RoundDetailDto,
  PublicAttendanceAccess,
  ParticipantDto,
} from "../../src/modules/events/dto/response/attendance.response.dto.js";
import {
  seedDemoRestaurants,
  demoRestaurantIds,
} from "../../src/database/seeds/restaurants-demo.seed.js";
import { AttendanceResponse } from "../../src/modules/events/entities/attendance-response.entity.js";
import { AttendanceRound } from "../../src/modules/events/entities/attendance-round.entity.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";

async function json<T>(response: Response, status = 200): Promise<T> {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
}
test("event roster imports preserve 20 identities; round responses, public first-link race, overrides, closing and reservation snapshots", async (t) => {
  const { call, signup, db, logs } = await startResourceApplication(t);
  for (const key of ["info", "open", "save"])
    await db
      .getRepository(AuthAttempt)
      .delete({ key: tokenHash(`attendance:${key}:ip:127.0.0.1`) });
  const owner = await signup(),
    other = await signup();
  const members = Array.from({ length: 20 }, (_, i) => ({
    name: i === 0 ? "김민수" : `참여자${i}`,
    phoneLast4: i === 0 ? null : String(i).padStart(4, "0"),
  }));
  const group = await json<{ id: string }>(
    await call("groups", owner, "POST", {
      name: "행사 명단 테스트",
      creationKey: randomUUID(),
      members,
    }),
    201,
  );
  const event = await json<{ id: string }>(
    await call("events", owner, "POST", {
      name: "20명 행사",
      groupId: group.id,
    }),
    201,
  );
  const base = `events/${event.id}`,
    rounds = `${base}/attendance-rounds`;
  assert.deepEqual(await json(await call(rounds, owner)), {
    rounds: [],
    nextTitle: "1차",
  });
  assert.equal((await call(`${base}/participants`, other)).status, 404);
  assert.equal(
    (
      await call(rounds, "", "POST", {
        title: "침입",
        requestKey: randomUUID(),
      })
    ).status,
    401,
  );
  assert.equal(
    (await call(`${base}/participants/import-group`, other, "POST")).status,
    404,
  );
  assert.deepEqual(
    await json(
      await call(`${base}/participants/import-group`, owner, "POST"),
      201,
    ),
    { addedCount: 20 },
  );
  const roster = () =>
    call(`${base}/participants`, owner).then((r) => json<ParticipantDto[]>(r));
  const participants = await roster(),
    minsu = participants.find((p) => p.name === "김민수")!;
  const create = async (title: string) =>
    json<RoundDetailDto>(
      await call(rounds, owner, "POST", { title, requestKey: randomUUID() }),
      201,
    );
  const first = await create("1차"),
    second = await create("2차");
  const getRound = (id = first.id) =>
    call(`${rounds}/${id}`, owner).then((r) => json<RoundDetailDto>(r));
  const open = (round: RoundDetailDto, name: string, phoneLast4: string) =>
    call(`attendance/${round.shareId}/open`, "", "POST", {
      name,
      phoneLast4,
    }).then((r) => json<PublicAttendanceAccess>(r));
  const save = (
    round: RoundDetailDto,
    access: PublicAttendanceAccess,
    answer = "ATTENDING",
  ) =>
    call(`attendance/${round.shareId}/response`, "", "POST", {
      accessToken: access.accessToken,
      answer,
    });
  const info = await json(await call(`attendance/${first.shareId}`));
  assert.deepEqual(Object.keys(info as object).sort(), [
    "closed",
    "eventName",
    "roundTitle",
    "scheduledAt",
  ]);
  const opened = await open(first, " 김민수 ", "0012");
  assert.equal(opened.kind, "FIRST");
  assert.equal((await roster())[0].phoneLast4, null);
  assert.equal((await getRound()).counts.attending, 0);
  await json(await save(first, opened));
  let direct = await open(first, "김민수", "0012");
  assert.equal(direct.response?.selfAnswer, "ATTENDING");
  await json(await save(second, await open(second, "김민수", "0012")));
  assert.equal((await getRound(second.id)).counts.attending, 1);
  // Import again after editing an event-only value never overwrites that participant or response.
  const current = (await roster()).find((p) => p.id === minsu.id)!;
  await json(
    await call(`${base}/participants/${minsu.id}`, owner, "PATCH", {
      name: "김민수",
      phoneLast4: "0012",
      label: "행사 메모",
      expectedVersion: current.version,
    }),
  );
  assert.deepEqual(
    await json(
      await call(`${base}/participants/import-group`, owner, "POST"),
      201,
    ),
    { addedCount: 0 },
  );
  assert.equal((await roster()).length, 20);
  assert.equal((await roster())[0].label, "행사 메모");
  assert.equal((await getRound()).counts.attending, 1);
  const groupRoster = await json<ParticipantDto[]>(
    await call(`groups/${group.id}/members`, owner),
  );
  assert.equal(groupRoster[0].phoneLast4, null);
  await seedDemoRestaurants(db);
  const inquiry = await json<{
    id: string;
    snapshot: { expectedGuests: number };
    targets: unknown[];
  }>(
    await call(`${base}/reservation-requests`, owner, "POST", {
      requestKey: randomUUID(),
      mode: "DIRECT",
      expectedEventVersion: 1,
      restaurantIds: demoRestaurantIds.slice(0, 2),
      conditions: {
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        expectedGuests: 20,
        region: "건대입구",
        seating: "ANY",
        space: "ANY",
        seatingImportance: null,
        spaceImportance: null,
        budgetBasis: null,
        budgetAmount: null,
        alcohol: null,
        additionalRequests: null,
      },
      contact: { name: "총무", phone: "01000001234" },
    }),
    201,
  );
  // Cookie-less browser B modifies the same first-round response only.
  direct = await open(first, "김민수", "0012");
  await json(await save(first, direct, "ABSENT"));
  assert.deepEqual((await getRound()).counts, {
    attending: 0,
    absent: 1,
    unanswered: 19,
    pending: 0,
  });
  assert.equal((await getRound(second.id)).counts.attending, 1);
  assert.deepEqual(
    (
      await json<{ request: unknown }>(
        await call(`${base}/reservation-requests`, owner),
      )
    ).request,
    inquiry,
  );
  // A direct event-only namesake remains a separate identity.
  const addition = {
    requestKey: randomUUID(),
    members: [
      { name: "김민수", phoneLast4: "9999" },
      { name: "최초 경쟁", phoneLast4: null },
    ],
  };
  await json(await call(`${base}/participants`, owner, "POST", addition), 201);
  await json(await call(`${base}/participants`, owner, "POST", addition), 201);
  assert.equal((await roster()).length, 22);
  const [raceA, raceB] = await Promise.all([
    open(first, "최초 경쟁", "1234"),
    open(first, "최초 경쟁", "5678"),
  ]);
  const race = await Promise.all([save(first, raceA), save(first, raceB)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 400]);
  const linked = (await roster()).find((p) => p.name === "최초 경쟁")!;
  assert(["1234", "5678"].includes(linked.phoneLast4!));
  assert.equal(
    await db
      .getRepository(AttendanceResponse)
      .countBy({ roundId: first.id, participantId: linked.id }),
    1,
  );
  assert.equal((await open(first, "김민수", "0012")).kind, "DIRECT");
  assert.equal((await open(first, "김민수", "9999")).kind, "DIRECT");
  // Self answer and manager override remain independent through subsequent public saves.
  direct = await open(first, "김민수", "0012");
  await json(await save(first, direct));
  let row = (await getRound()).participants.find((p) => p.id === minsu.id)!;
  await json(
    await call(`${rounds}/${first.id}/responses/${minsu.id}`, owner, "PUT", {
      expectedVersion: row.response.version,
      managerOverride: "ABSENT",
    }),
  );
  direct = await open(first, "김민수", "0012");
  await json(await save(first, direct));
  direct = await open(first, "김민수", "0012");
  assert.equal(direct.response?.selfAnswer, "ATTENDING");
  assert.equal(direct.response?.managerOverride, "ABSENT");
  assert.equal(direct.response?.finalState, "ABSENT");
  row = (await getRound()).participants.find((p) => p.id === minsu.id)!;
  await json(
    await call(`${rounds}/${first.id}/responses/${minsu.id}`, owner, "PUT", {
      expectedVersion: row.response.version,
      managerOverride: null,
    }),
  );
  assert.equal(
    (await open(first, "김민수", "0012")).response?.finalState,
    "ATTENDING",
  );
  // A roster edit invalidates previously issued direct authorization.
  const oldAccess = await open(first, "참여자1", "0001"),
    person = (await roster()).find((p) => p.name === "참여자1")!;
  await json(
    await call(`${base}/participants/${person.id}`, owner, "PATCH", {
      name: person.name,
      phoneLast4: "8181",
      expectedVersion: person.version,
    }),
  );
  assert.equal((await save(first, oldAccess)).status, 400);
  const openBeforeClose = await open(first, "김민수", "0012");
  await json(await call(`${rounds}/${first.id}/close`, owner, "POST"));
  assert.equal((await save(first, openBeforeClose, "ABSENT")).status, 409);
  assert.equal(
    (
      await call(`attendance/${first.shareId}/open`, "", "POST", {
        name: "김민수",
        phoneLast4: "0012",
      })
    ).status,
    409,
  );
  row = (await getRound()).participants.find((p) => p.id === minsu.id)!;
  assert.equal(
    (
      await call(`${rounds}/${first.id}/responses/${minsu.id}`, owner, "PUT", {
        expectedVersion: row.response.version,
        managerOverride: "UNANSWERED",
      })
    ).status,
    400,
  );
  await json(
    await call(`${rounds}/${first.id}/responses/${minsu.id}`, owner, "PUT", {
      expectedVersion: row.response.version,
      managerOverride: "ABSENT",
    }),
  );
  assert.equal(
    (await getRound()).participants.find((p) => p.id === minsu.id)?.response
      .finalState,
    "ABSENT",
  );
  const outsider = await json<{ id: string }>(
    await call("events", other, "POST", { name: "다른 총무" }),
    201,
  );
  assert.equal(
    (await call(`events/${outsider.id}/attendance-rounds/${first.id}`, other))
      .status,
    404,
  );
  assert.equal(
    (
      await call(`attendance/${second.shareId}/response`, "", "POST", {
        accessToken: openBeforeClose.accessToken,
        answer: "ABSENT",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`attendance/${second.shareId}/response`, "", "POST", {
        accessToken: (await open(second, "김민수", "0012")).accessToken,
        participantId: person.id,
        answer: "ABSENT",
      })
    ).status,
    400,
  );
  await db
    .getRepository(AttendanceRound)
    .update({ id: second.id }, { revokedAt: new Date() });
  assert.equal((await call(`attendance/${second.shareId}`)).status, 404);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /accessToken|phoneLast4|01000001234|행사 메모/,
  );
});

test("pending identity reviews remain separate from counts, resolve atomically with conflict checks and never pin duplicate identities", async (t) => {
  const { call, signup, db } = await startResourceApplication(t);
  for (const key of ["info", "open", "save"])
    await db
      .getRepository(AuthAttempt)
      .delete({ key: tokenHash(`attendance:${key}:ip:127.0.0.1`) });
  const owner = await signup();
  const event = await json<{ id: string }>(
      await call("events", owner, "POST", { name: "예약 없는 개인 행사" }),
      201,
    ),
    base = `events/${event.id}`;
  const add = async (members: { name: string; phoneLast4?: string | null }[]) =>
    json(
      await call(`${base}/participants`, owner, "POST", {
        requestKey: randomUUID(),
        members,
      }),
      201,
    );
  const list = () =>
    call(`${base}/participants`, owner).then((r) => json<ParticipantDto[]>(r));
  assert.equal(
    (await call(`${base}/participants/import-group`, owner, "POST")).status,
    400,
  );
  for (const name of [
    "01012340012",
    "010 1234 0012",
    "김민수01012340012",
    "0012",
  ])
    assert.equal(
      (
        await call(`${base}/participants`, owner, "POST", {
          requestKey: randomUUID(),
          members: [{ name }],
        })
      ).status,
      400,
    );
  await add([
    { name: "동일인", phoneLast4: "1234" },
    { name: "동일인", phoneLast4: "1234" },
    { name: "이름중복" },
    { name: "이름중복" },
    { name: "연결 대상", phoneLast4: null },
    { name: "고유 대상", phoneLast4: "9000" },
  ]);
  const round = await json<RoundDetailDto>(
      await call(`${base}/attendance-rounds`, owner, "POST", {
        title: "1차",
        requestKey: randomUUID(),
      }),
      201,
    ),
    roundPath = `${base}/attendance-rounds/${round.id}`;
  const open = (name: string, phoneLast4: string) =>
    call(`attendance/${round.shareId}/open`, "", "POST", {
      name,
      phoneLast4,
    }).then((r) => json<PublicAttendanceAccess>(r));
  const save = (access: PublicAttendanceAccess, answer = "ATTENDING") =>
    call(`attendance/${round.shareId}/response`, "", "POST", {
      accessToken: access.accessToken,
      answer,
    });
  const detail = () =>
    call(roundPath, owner).then((r) => json<RoundDetailDto>(r));
  const resolve = (reviewId: string, input: unknown) =>
    call(`${roundPath}/reviews/${reviewId}/resolve`, owner, "POST", input);
  let duplicate = await open("동일인", "1234");
  assert.equal(duplicate.kind, "REVIEW");
  assert.equal(duplicate.response, null);
  await json(await save(duplicate));
  await json(await save(duplicate, "ABSENT"));
  let current = await detail();
  assert.equal(current.counts.pending, 1);
  assert.equal(current.counts.attending, 0);
  assert.equal(current.reviews[0].version, 2);
  assert.equal(current.reviews[0].answer, "ABSENT");
  let review = current.reviews[0],
    target = current.participants.find((p) => p.name === "동일인")!;
  const linking = {
    action: "LINK",
    expectedReviewVersion: review.version,
    participantId: target.id,
    expectedParticipantVersion: target.version,
    expectedResponseVersion: 0,
  };
  const linked = await Promise.all([
    resolve(review.id, linking),
    resolve(review.id, linking),
  ]);
  for (const response of linked) await json(response);
  current = await detail();
  assert.equal(current.counts.absent, 1);
  assert.equal(current.reviews.filter((r) => r.status === "LINKED").length, 1);
  assert.equal(current.counts.pending, 0);
  duplicate = await open("동일인", "1234");
  assert.equal(duplicate.kind, "REVIEW");
  assert.equal(duplicate.response, null);
  await json(await save(duplicate));
  current = await detail();
  assert.equal(current.reviews.length, 2);
  assert.equal(current.counts.pending, 1);
  assert.equal(current.counts.absent, 1);
  // Previously direct access is reclassified when a new duplicate is added.
  const old = await open("고유 대상", "9000");
  assert.equal(old.kind, "DIRECT");
  await json(await save(old));
  await add([{ name: "고유 대상", phoneLast4: "9000" }]);
  const reclassified = await json<{ kind: string; response: unknown }>(
    await save(old, "ABSENT"),
  );
  assert.equal(reclassified.kind, "REVIEW");
  assert.equal(reclassified.response, null);
  assert.equal(
    (await detail()).participants.find((p) => p.name === "고유 대상")?.response
      .selfAnswer,
    "ATTENDING",
  );
  const ambiguous = await open("이름중복", "1111");
  assert.equal(ambiguous.kind, "REVIEW");
  await json(await save(ambiguous));
  // Unregistered names update one pending record; NEW resolves one participant despite retries.
  const unknown = await open("명단 밖", "0012");
  await json(await save(unknown));
  await json(await save(unknown, "ABSENT"));
  current = await detail();
  review = current.reviews.find((r) => r.name === "명단 밖")!;
  assert.equal(review.version, 2);
  const newInput = { action: "NEW", expectedReviewVersion: review.version };
  await Promise.all([
    resolve(review.id, newInput),
    resolve(review.id, newInput),
  ]).then(async (responses) => {
    for (const response of responses) await json(response);
  });
  assert.equal((await list()).filter((p) => p.name === "명단 밖").length, 1);
  assert.equal((await open("명단 밖", "0012")).response?.selfAnswer, "ABSENT");
  // Re-submit while a manager is reviewing: stale review must not apply.
  const conflict = await open("확인 경쟁", "2222");
  await json(await save(conflict));
  current = await detail();
  review = current.reviews.find((r) => r.name === "확인 경쟁")!;
  await json(await save(conflict, "ABSENT"));
  assert.equal(
    (
      await resolve(review.id, {
        action: "NEW",
        expectedReviewVersion: review.version,
      })
    ).status,
    409,
  );
  assert.equal((await list()).filter((p) => p.name === "확인 경쟁").length, 0);
  // Link to someone with an existing answer: explicit KEEP/APPLY and both version checks.
  const existing = await open("연결 대상", "3333");
  await json(await save(existing));
  const input = await open("별명 제출", "3333");
  await json(await save(input, "ABSENT"));
  current = await detail();
  review = current.reviews.find((r) => r.name === "별명 제출")!;
  target = current.participants.find((p) => p.name === "연결 대상")!;
  let link = {
    action: "LINK",
    expectedReviewVersion: review.version,
    participantId: target.id,
    expectedParticipantVersion: target.version,
    expectedResponseVersion: target.response.version,
  };
  assert.equal((await resolve(review.id, link)).status, 400);
  await json(await save(await open("연결 대상", "3333")));
  assert.equal(
    (await resolve(review.id, { ...link, responseChoice: "APPLY" })).status,
    409,
  );
  target = (await detail()).participants.find((p) => p.id === target.id)!;
  link = { ...link, expectedResponseVersion: target.response.version };
  await json(await resolve(review.id, { ...link, responseChoice: "KEEP" }));
  assert.equal(
    (await open("연결 대상", "3333")).response?.selfAnswer,
    "ATTENDING",
  );
  // Processed history is never reopened. Same unlisted alias creates a new pending record.
  await json(await save(input, "ABSENT"));
  current = await detail();
  review = current.reviews.find(
    (r) => r.name === "별명 제출" && r.status === "PENDING",
  )!;
  target = current.participants.find((p) => p.name === "연결 대상")!;
  await json(
    await resolve(review.id, {
      ...link,
      expectedReviewVersion: review.version,
      expectedResponseVersion: target.response.version,
      responseChoice: "APPLY",
    }),
  );
  assert.equal(
    (await open("연결 대상", "3333")).response?.selfAnswer,
    "ABSENT",
  );
  current = await detail();
  review = current.reviews.find(
    (r) => r.status === "PENDING" && r.name === "확인 경쟁",
  )!;
  const before = structuredClone(current.counts);
  await json(
    await resolve(review.id, {
      action: "EXCLUDE",
      expectedReviewVersion: review.version,
    }),
  );
  current = await detail();
  assert.equal(current.counts.attending, before.attending);
  assert.equal(current.counts.pending, before.pending - 1);
  // Number mismatch on manager linking cannot overwrite a known number.
  review = current.reviews.find(
    (r) => r.status === "PENDING" && r.name === "이름중복",
  )!;
  target = current.participants.find((p) => p.name === "연결 대상")!;
  assert.equal(
    (
      await resolve(review.id, {
        action: "LINK",
        expectedReviewVersion: review.version,
        participantId: target.id,
        expectedParticipantVersion: target.version,
        expectedResponseVersion: target.response.version,
        responseChoice: "APPLY",
      })
    ).status,
    409,
  );
  const otherEvent = await json<{ id: string }>(
    await call("events", owner, "POST", { name: "다른 행사" }),
    201,
  );
  await json(
    await call(`events/${otherEvent.id}/participants`, owner, "POST", {
      requestKey: randomUUID(),
      members: [{ name: "외부", phoneLast4: "1111" }],
    }),
    201,
  );
  const alien = (
    await json<ParticipantDto[]>(
      await call(`events/${otherEvent.id}/participants`, owner),
    )
  )[0];
  assert.equal(
    (
      await resolve(review.id, {
        action: "LINK",
        expectedReviewVersion: review.version,
        participantId: alien.id,
        expectedParticipantVersion: alien.version,
        expectedResponseVersion: 0,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`${roundPath}/responses/${alien.id}`, owner, "PUT", {
        expectedVersion: 0,
        managerOverride: "ATTENDING",
      })
    ).status,
    404,
  );
  await assert.rejects(
    db.getRepository(AttendanceResponse).insert({
      roundId: round.id,
      eventId: event.id,
      participantId: alien.id,
      selfAnswer: "ATTENDING",
      managerOverride: null,
      version: 1,
      selfRespondedAt: new Date(),
      overriddenAt: null,
    }),
  );
  await json(await call(`${roundPath}/close`, owner, "POST"));
  await json(
    await resolve(review.id, {
      action: "EXCLUDE",
      expectedReviewVersion: review.version,
    }),
  );
  // Public write limits count rejected identity attempts too; never echo caller input.
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await call(`attendance/${round.shareId}/open`, "", "POST", {
          name: "제한 확인",
          phoneLast4: "4545",
        })
      ).status,
      409,
    );
  const limited = await call(`attendance/${round.shareId}/open`, "", "POST", {
    name: "제한 확인",
    phoneLast4: "4545",
  });
  assert.equal(limited.status, 429);
});

test("100 participants behind one NAT can open and save a round; name guessing remains limited", async (t) => {
  const { call, signup } = await startResourceApplication(t);
  const jar = await signup();
  const event = await json<{ id: string }>(
    await call("events", jar, "POST", { name: "공유 IP 행사" }),
    201,
  );
  await json(
    await call(`events/${event.id}/participants`, jar, "POST", {
      requestKey: randomUUID(),
      members: Array.from({ length: 100 }, (_, i) => ({
        name: `NAT 참여자${i}`,
        phoneLast4: String(i).padStart(4, "0"),
        label: null,
      })),
    }),
    201,
  );
  const round = await json<RoundDetailDto>(
    await call(`events/${event.id}/attendance-rounds`, jar, "POST", {
      title: "1차",
      requestKey: randomUUID(),
    }),
    201,
  );
  for (let i = 0; i < 100; i++) {
    const opened = await json<PublicAttendanceAccess>(
      await call(`attendance/${round.shareId}/open`, "", "POST", {
        name: `NAT 참여자${i}`,
        phoneLast4: String(i).padStart(4, "0"),
      }),
    );
    await json(
      await call(`attendance/${round.shareId}/response`, "", "POST", {
        accessToken: opened.accessToken,
        answer: "ATTENDING",
      }),
    );
  }
  const detail = await json<RoundDetailDto>(
    await call(`events/${event.id}/attendance-rounds/${round.id}`, jar),
  );
  assert.equal(detail.counts.attending, 100);
  for (let i = 0; i < 30; i++)
    await call(`attendance/${round.shareId}/open`, "", "POST", {
      name: "반복 추측",
      phoneLast4: String(i).padStart(4, "0"),
    });
  assert.equal(
    (
      await call(`attendance/${round.shareId}/open`, "", "POST", {
        name: "반복 추측",
        phoneLast4: "9999",
      })
    ).status,
    429,
  );
});
