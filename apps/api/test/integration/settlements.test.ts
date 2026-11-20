import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { SettlementsService } from "../../src/modules/settlements/settlements.service.js";
import { FileStorage } from "../../src/modules/files/file-storage.js";
import { MemoryFileStorage } from "../support/memory-file-storage.js";
import { EventParticipant } from "../../src/modules/events/entities/event-participant.entity.js";
import { AttendanceResponse } from "../../src/modules/events/entities/attendance-response.entity.js";
import type { Person } from "../../src/modules/settlements/types/settlement.js";
type View = Awaited<ReturnType<SettlementsService["get"]>>;
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};
test("settlement authority, immutable facts, lost responses, concurrency, private files and record history", async (t) => {
  const { app, db, call, signup, url } = await startResourceApplication(t),
    owner = await signup(),
    other = await signup();
  const storage = app.get(FileStorage),
    memory = new MemoryFileStorage();
  storage.put = memory.put.bind(memory);
  storage.get = memory.get.bind(memory);
  storage.delete = memory.delete.bind(memory);
  async function fixture(group = false) {
    const g = group
      ? await json<{ id: string }>(
          await call("groups", owner, "POST", {
            name: "기록 모임",
            creationKey: randomUUID(),
            members: [],
          }),
          201,
        )
      : null;
    const e = await json<{ id: string }>(
      await call("events", owner, "POST", {
        name: "지난 행사 정산",
        creationKey: randomUUID(),
        ...(g ? { groupId: g.id } : {}),
      }),
      201,
    );
    const base = `events/${e.id}`;
    await json(
      await call(`${base}/participants`, owner, "POST", {
        requestKey: randomUUID(),
        members: [
          {
            name: "김민수",
            phoneLast4: "0012",
            label: "A",
            newPersonConfirmed: true,
          },
          {
            name: "김민수",
            phoneLast4: "0013",
            label: "B",
            newPersonConfirmed: true,
          },
          { name: "이지수", phoneLast4: "0014", newPersonConfirmed: true },
        ],
        duplicatesConfirmed: true,
      }),
      201,
    );
    const people = await json<Person[]>(
      await call(`${base}/participants`, owner),
    );
    const rounds = [];
    for (const title of ["1차", "2차"])
      rounds.push(
        await json<{ id: string }>(
          await call(`${base}/attendance-rounds`, owner, "POST", {
            requestKey: randomUUID(),
            title,
          }),
          201,
        ),
      );
    return { e, base, people, rounds, g };
  }
  const f = await fixture(),
    foreign = await fixture();
  const path = `${f.base}/settlement`;
  const view = () => call(path, owner).then((r) => json<View>(r));
  let state = await view();
  const post = async (c: Record<string, unknown>, status = 200) =>
    json<View>(
      await call(path, owner, "POST", {
        command: {
          requestKey: randomUUID(),
          expectedVersion: state.state.version,
          ...c,
        },
      }),
      status,
    );
  const expense = (more: Record<string, unknown> = {}) => ({
    action: "EXPENSE",
    id: randomUUID(),
    roundId: f.rounds[0]!.id,
    name: "식사",
    total: 10000,
    deposit: 0,
    includeDeposit: true,
    support: 0,
    reservationId: null,
    memo: "",
    payers: [{ id: f.people[0]!.id, version: 1 }],
    remainder: null,
    fileIds: [],
    ...more,
  });
  assert.equal((await call(path, other)).status, 404);
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(`${f.base}/files`)).status, 401);
  await post(expense({ roundId: foreign.rounds[0]!.id }), 400);
  await post(
    expense({ payers: [{ id: foreign.people[0]!.id, version: 1 }] }),
    409,
  );
  const first = expense(),
    key = randomUUID(),
    command = { ...first, requestKey: key, expectedVersion: 0 };
  state = await json<View>(await call(path, owner, "POST", { command }));
  state = await json<View>(await call(path, owner, "POST", { command }));
  assert.equal(state.state.expenses.length, 1);
  assert.equal(
    (await call(path, owner, "POST", { command: { ...command, total: 12000 } }))
      .status,
    409,
  );
  await db.manager.save(
    db.manager.create(AttendanceResponse, {
      roundId: f.rounds[0]!.id,
      eventId: f.e.id,
      participantId: f.people[1]!.id,
      selfAnswer: "ATTENDING",
      managerOverride: null,
      version: 1,
      selfRespondedAt: new Date(),
      overriddenAt: null,
    }),
  );
  state = await view();
  assert.equal(state.summary.people[0]!.person.id, f.people[0]!.id);
  const notice = {
    action: "NOTICE",
    replaces: null,
    title: "정산",
    message: "원문",
    bank: { bank: "테스트", account: "123-456", holder: "총무" },
    saveBank: true,
    deadline: "2026-11-20",
    includePeople: true,
    scope: "UNCONFIRMED",
  };
  const noticeCommand = {
    ...notice,
    requestKey: randomUUID(),
    expectedVersion: state.state.version,
  };
  const created = await json<View & { createdNoticeId: string }>(
    await call(path, owner, "POST", { command: noticeCommand }),
  );
  const recovered = await json<View & { createdNoticeId: string }>(
    await call(path, owner, "POST", { command: noticeCommand }),
  );
  assert.equal(created.createdNoticeId, noticeCommand.requestKey);
  assert.equal(recovered.createdNoticeId, created.createdNoticeId);
  assert.equal(recovered.state.notices.length, 1);
  assert.equal(recovered.state.notices[0]!.deadline, "2026-11-20");
  assert.equal(recovered.state.notices[0]!.ownerChanged, false);
  state = recovered;
  const oldId = state.state.notices[0]!.id,
    oldText = await json<{ text: string }>(
      await call(`${path}/notices/${oldId}`, owner),
    );
  assert(!oldText.text.includes("0012"));
  assert(!JSON.stringify(state.state.notices).includes("123-456"));
  state = await post({
    action: "RECEIPT",
    participantId: f.people[0]!.id,
    amount: 10000,
    calculationVersion: state.state.calculationVersion,
  });
  assert.equal(state.summary.status, "COMPLETE");
  assert.equal(state.state.notices[0]!.outdated, true);
  const staleNotice = await json<{ text: string; outdated: boolean }>(
    await call(`${path}/notices/${oldId}`, owner),
  );
  assert.equal(staleNotice.outdated, true);
  assert.equal(staleNotice.text, oldText.text);
  state = await post({ ...first, total: 12000 });
  assert.equal(state.summary.people[0]!.remaining, 2000);
  assert.equal(state.summary.received, 10000);
  assert.equal(state.state.notices[0]!.outdated, true);
  state = await post({ ...first, total: 8000 });
  assert.equal(state.summary.people[0]!.excess, 2000);
  const refund = {
    action: "RETURN",
    returnedAt: "2026-01-01T10:00:00.000Z",
    participantId: f.people[0]!.id,
    amount: 2000,
    reason: "실제 반환 확인",
    requestKey: randomUUID(),
    expectedVersion: state.state.version,
  };
  await post(
    { ...refund, requestKey: randomUUID(), returnedAt: undefined },
    400,
  );
  await post(
    { ...refund, requestKey: randomUUID(), returnedAt: "invalid" },
    400,
  );
  await post(
    { ...refund, requestKey: randomUUID(), returnedAt: "2099-01-01T00:00:00Z" },
    400,
  );
  state = await post(refund);
  state = await post(refund);
  assert.equal(
    state.state.payments.filter((p) => p.kind === "RETURN").length,
    1,
  );
  assert.equal(state.state.payments[1]!.returnedAt, "2026-01-01T10:00:00.000Z");
  assert.notEqual(
    state.state.payments[1]!.at,
    state.state.payments[1]!.returnedAt,
  );
  assert.equal(state.summary.status, "COMPLETE");
  assert.equal(state.summary.received, 8000);
  await post(
    {
      action: "CORRECTION",
      paymentId: state.state.payments[0]!.id,
      reason: "잘못 체크",
    },
    400,
  );
  await post(
    {
      action: "RETURN",
      returnedAt: "2026-01-01T10:00:00.000Z",
      participantId: f.people[0]!.id,
      amount: 8001,
      reason: "초과",
    },
    400,
  );
  state = await post({
    action: "CORRECTION",
    paymentId: state.state.payments[1]!.id,
    reason: "반환 체크 오류",
  });
  assert.equal(state.summary.people[0]!.excess, 2000);
  assert.equal(state.state.payments.length, 3);
  state = await post({
    action: "RETURN",
    returnedAt: "2026-01-01T10:00:00.000Z",
    participantId: f.people[0]!.id,
    amount: 2000,
    reason: "은행 확인 후 실제 반환",
  });
  state = await post({
    ...notice,
    message: "새 문구",
    bank: { bank: "새 은행", account: "999", holder: "다른 예금주" },
  });
  assert.deepEqual(await json(await call(`${path}/notices/${oldId}`, owner)), {
    ...(await json<Record<string, unknown>>(
      await call(`${path}/notices/${oldId}`, owner),
    )),
    text: oldText.text,
  });
  const draft = expense({ payers: [] });
  state = await post(draft);
  assert.equal(state.summary.drafts, 1);
  await post(notice, 409);
  state = await post({ ...draft, total: 50000, deposit: 0, support: 50000 });
  assert.equal(state.summary.drafts, 0);
  const sameVersion = state.state.version;
  const race = await Promise.all([
    call(path, owner, "POST", {
      command: {
        ...expense(),
        expectedVersion: sameVersion,
        requestKey: randomUUID(),
      },
    }),
    call(path, owner, "POST", {
      command: {
        ...expense(),
        expectedVersion: sameVersion,
        requestKey: randomUUID(),
      },
    }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  state = await view();
  await db.manager.update(
    EventParticipant,
    { id: f.people[0]!.id },
    { name: "바뀐 이름", version: 2 },
  );
  await post({ ...first, total: 9000 }, 409);
  assert.equal(state.state.expenses[0]!.payers[0]!.name, "김민수");
  // Real HTTP multipart, explicit memory provider only; no S3 requests.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de",
    "hex",
  );
  const upload = async (
    id: string,
    bytes: Buffer = png,
    name = "영수증_이름.png",
    mime = "image/png",
    jar = owner,
    event = f.e.id,
  ) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      name,
    );
    form.append("filename", name);
    return fetch(`${url}/api/v1/events/${event}/files/${id}/upload`, {
      method: "POST",
      headers: {
        Cookie: jar,
        Origin: "http://localhost:3000",
        "X-CSRF-Protection": "1",
      },
      body: form,
    });
  };
  const fid = randomUUID();
  assert.equal(
    (await upload(fid, png, "x.png", "image/png", other)).status,
    404,
  );
  assert.equal(
    (await upload(randomUUID(), Buffer.from("<script>bad</script>"))).status,
    400,
  );
  assert.equal(
    (await upload(randomUUID(), Buffer.alloc(10485761))).status,
    413,
  );
  memory.failPut = true;
  assert.equal((await upload(fid)).status, 503);
  let files = await json<{
    files: {
      id: string;
      status: string;
      version: number;
      expenseId: string | null;
    }[];
  }>(await call(`${f.base}/files`, owner));
  assert.equal(files.files[0]!.status, "FAILED");
  assert.match(JSON.stringify(files), /영수증_이름/);
  memory.failPut = false;
  assert.equal((await upload(fid)).status, 200);
  assert.equal((await upload(fid)).status, 200);
  assert.equal(memory.objects.size, 1);
  state = await post({
    ...draft,
    total: 50000,
    support: 50000,
    fileIds: [fid],
  });
  assert.equal(
    (await call(`${f.base}/files/${fid}/download`, other)).status,
    404,
  );
  assert.equal(
    (
      await call(`${f.base}/files/${fid}/delete`, owner, "POST", {
        expectedVersion: 1,
      })
    ).status,
    409,
  );
  const downloaded = await call(`${f.base}/files/${fid}/download`, owner);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("content-disposition")!, /attachment/);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
  const objectKey = [...memory.objects.keys()][0]!;
  memory.objects.set(objectKey, Buffer.from(png).fill(0));
  assert.equal(
    (await call(`${f.base}/files/${fid}/download`, owner)).status,
    503,
  );
  memory.objects.set(objectKey, png.subarray(1));
  assert.equal(
    (await call(`${f.base}/files/${fid}/download`, owner)).status,
    503,
  );
  memory.objects.set(objectKey, png);
  const foreignPath = `${foreign.base}/settlement`;
  assert.equal(
    (
      await call(foreignPath, owner, "POST", {
        command: {
          ...expense({
            roundId: foreign.rounds[0]!.id,
            payers: [],
            fileIds: [fid],
          }),
          expectedVersion: 0,
          requestKey: randomUUID(),
        },
      })
    ).status,
    400,
  );
  state = await post({ action: "DELETE_EXPENSE", id: draft.id });
  files = await json(await call(`${f.base}/files`, owner));
  assert.equal(files.files[0]!.expenseId, null);
  assert.equal(state.state.payments.length, 4);
  assert.equal(state.state.notices.length, 2);
  memory.failDelete = true;
  assert.equal(
    (
      await call(`${f.base}/files/${fid}/delete`, owner, "POST", {
        expectedVersion: files.files[0]!.version,
      })
    ).status,
    503,
  );
  assert.equal(
    (await call(`${f.base}/files/${fid}/download`, owner)).status,
    404,
  );
  memory.failDelete = false;
  assert.equal(
    (
      await call(`${f.base}/files/${fid}/delete`, owner, "POST", {
        expectedVersion: files.files[0]!.version,
      })
    ).status,
    200,
  );
  const { EventFile } =
    await import("../../src/modules/files/entities/event-file.entity.js");
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      entered = r;
    }),
    realPut = storage.put;
  storage.put = async (key, body, mime) => {
    entered();
    await gate;
    await realPut(key, body, mime);
  };
  const lateId = randomUUID(),
    pendingUpload = upload(lateId);
  await started;
  await db.manager.update(
    EventFile,
    { id: lateId },
    { updatedAt: new Date(Date.now() - 180000) },
  );
  assert.equal(
    (
      await call(`${f.base}/files/${lateId}/delete`, owner, "POST", {
        expectedVersion: 1,
      })
    ).status,
    200,
  );
  release();
  assert.equal((await pendingUpload).status, 409);
  storage.put = realPut;
  assert.equal(
    (await call(`${f.base}/files/${lateId}/download`, owner)).status,
    404,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(EventFile, { id: lateId })).status,
    "DELETE_FAILED",
  );
  assert.equal(
    (
      await call(`${f.base}/files/${lateId}/delete`, owner, "POST", {
        expectedVersion: 2,
      })
    ).status,
    200,
  );
  // A stale provider result cannot overwrite a newer successful delete.
  const overlapId = randomUUID();
  assert.equal((await upload(overlapId)).status, 200);
  const realDelete = storage.delete;
  let enterDelete!: () => void, releaseDelete!: () => void;
  const deleteStarted = new Promise<void>((r) => {
    enterDelete = r;
  });
  const deleteGate = new Promise<void>((r) => {
    releaseDelete = r;
  });
  storage.delete = async () => {
    enterDelete();
    await deleteGate;
    throw new Error("late failure");
  };
  const oldDelete = call(`${f.base}/files/${overlapId}/delete`, owner, "POST", {
    expectedVersion: 1,
  });
  await deleteStarted;
  assert.equal(
    (
      await call(`${f.base}/files/${overlapId}/delete`, owner, "POST", {
        expectedVersion: 2,
      })
    ).status,
    409,
  );
  await db.manager.update(
    EventFile,
    { id: overlapId },
    { updatedAt: new Date(Date.now() - 180000) },
  );
  storage.delete = realDelete;
  assert.equal(
    (
      await call(`${f.base}/files/${overlapId}/delete`, owner, "POST", {
        expectedVersion: 2,
      })
    ).status,
    200,
  );
  releaseDelete();
  assert.equal((await oldDelete).status, 200);
  assert.equal(
    (await db.manager.findOneByOrFail(EventFile, { id: overlapId })).status,
    "DELETED",
  );
  // A stale success must not claim that a newer failed cleanup is complete.
  const reverseId = randomUUID();
  assert.equal((await upload(reverseId)).status, 200);
  let enteredReverse!: () => void, releaseReverse!: () => void;
  const reverseStarted = new Promise<void>((r) => {
    enteredReverse = r;
  });
  const reverseGate = new Promise<void>((r) => {
    releaseReverse = r;
  });
  storage.delete = async (key) => {
    enteredReverse();
    await reverseGate;
    await realDelete(key);
  };
  const reverseOld = call(
    `${f.base}/files/${reverseId}/delete`,
    owner,
    "POST",
    { expectedVersion: 1 },
  );
  await reverseStarted;
  await db.manager.update(
    EventFile,
    { id: reverseId },
    { updatedAt: new Date(Date.now() - 180000) },
  );
  storage.delete = async () => {
    throw new Error("new failure");
  };
  assert.equal(
    (
      await call(`${f.base}/files/${reverseId}/delete`, owner, "POST", {
        expectedVersion: 2,
      })
    ).status,
    503,
  );
  releaseReverse();
  assert.equal((await reverseOld).status, 409);
  assert.equal(
    (await db.manager.findOneByOrFail(EventFile, { id: reverseId })).status,
    "DELETE_FAILED",
  );
  storage.delete = realDelete;
  assert.equal(
    (
      await call(`${f.base}/files/${reverseId}/delete`, owner, "POST", {
        expectedVersion: 3,
      })
    ).status,
    200,
  );
  const grouped = await fixture(true);
  let zero = await json<View>(await call(`${grouped.base}/settlement`, owner));
  zero = await json<View>(
    await call(`${grouped.base}/settlement`, owner, "POST", {
      command: {
        ...expense({
          roundId: grouped.rounds[0]!.id,
          payers: [],
          total: 1,
          deposit: 0,
          support: 1,
        }),
        expectedVersion: zero.state.version,
        requestKey: randomUUID(),
      },
    }),
  );
  assert.equal(zero.summary.status, "COMPLETE");
  await json(
    await call(`${grouped.base}/settlement`, owner, "POST", {
      command: {
        ...notice,
        bank: null,
        saveBank: false,
        expectedVersion: zero.state.version,
        requestKey: randomUUID(),
      },
    }),
  );
  state = await post({ action: "MEMO", memo: "지난 기록은 보존" });
  assert.equal((await view()).state.memo, "지난 기록은 보존");
  const records = await json<{ events: { id: string }[] }>(
    await call(`records?groupId=${grouped.g!.id}`, owner),
  );
  assert.deepEqual(
    records.events.map((e) => e.id),
    [grouped.e.id],
  );
  assert.equal(
    (await call(`records?groupId=${grouped.g!.id}`, other)).status,
    404,
  );
  const personalRecords = await json<{
    count: number;
    events: { id: string; groupId: string | null }[];
  }>(await call("records?scope=personal", owner));
  assert(personalRecords.events.some((e) => e.id === f.e.id));
  assert(personalRecords.events.every((e) => e.groupId === null));
  assert(!personalRecords.events.some((e) => e.id === grouped.e.id));
  assert.equal(
    (await call(`records?scope=personal&groupId=${grouped.g!.id}`, owner))
      .status,
    400,
  );
  assert.equal((await call("records?scope=invalid", owner)).status, 400);
  await t.test(
    "synthetic two-round acceptance preserves payers, first notice and receipt through reconfirmation and correction",
    async () => {
      const f = await fixture(true),
        path = `${f.base}/settlement`;
      let current = await json<View>(await call(path, owner));
      const save = async (input: Record<string, unknown>) =>
        (current = await json<View>(
          await call(path, owner, "POST", {
            command: {
              requestKey: randomUUID(),
              expectedVersion: current.state.version,
              ...input,
            },
          }),
        ));
      for (const person of f.people.slice(1))
        await json(
          await call(
            `${f.base}/attendance-rounds/${f.rounds[1]!.id}/responses/${person.id}`,
            owner,
            "PUT",
            { expectedVersion: 0, managerOverride: "ATTENDING" },
          ),
        );
      const first = {
        ...expense(),
        id: randomUUID(),
        name: "합성 1차 선입금 포함",
        roundId: f.rounds[0]!.id,
        total: 500000,
        deposit: 100000,
        payers: f.people
          .slice(0, 2)
          .map((p) => ({ id: p.id, version: p.version })),
      };
      const second = {
        ...expense(),
        id: randomUUID(),
        name: "합성 2차 선입금 제외",
        roundId: f.rounds[1]!.id,
        total: 500000,
        deposit: 100000,
        includeDeposit: false,
        support: 50000,
        payers: f.people
          .slice(1)
          .map((p) => ({ id: p.id, version: p.version })),
      };
      await save(first);
      await save(second);
      await save({
        ...expense(),
        id: randomUUID(),
        roundId: f.rounds[0]!.id,
        total: 50000,
        deposit: 0,
        support: 50000,
        payers: [],
      });
      assert.equal(current.summary.target, 850000);
      assert.notDeepEqual(
        current.state.expenses[0]!.payers,
        current.state.expenses[1]!.payers,
      );
      await save(notice);
      const n = current.state.notices[0]!,
        original = await json<{ text: string }>(
          await call(`${path}/notices/${n.id}`, owner),
        );
      await save({
        action: "RECEIPT",
        participantId: f.people[0]!.id,
        amount: 250000,
        calculationVersion: current.state.calculationVersion,
      });
      const payerSnapshots = structuredClone(
          current.state.expenses.map((e) => e.payers),
        ),
        originalPayment = structuredClone(current.state.payments[0]);
      await json(
        await call(
          `${f.base}/attendance-rounds/${f.rounds[1]!.id}/responses/${f.people[1]!.id}`,
          owner,
          "PUT",
          { expectedVersion: 1, managerOverride: "ABSENT" },
        ),
      );
      await json(
        await call(
          `${f.base}/attendance-rounds/${f.rounds[1]!.id}/responses/${f.people[0]!.id}`,
          owner,
          "PUT",
          { expectedVersion: 0, managerOverride: "ATTENDING" },
        ),
      );
      current = await json<View>(await call(path, owner));
      assert.deepEqual(
        current.state.expenses.map((e) => e.payers),
        payerSnapshots,
      );
      await save({ ...first, total: 504000 });
      assert.equal(
        current.summary.people.find((p) => p.person.id === f.people[0]!.id)!
          .remaining,
        2000,
      );
      assert.deepEqual(current.state.payments[0], originalPayment);
      assert.equal(
        (
          await json<{ text: string }>(
            await call(`${path}/notices/${n.id}`, owner),
          )
        ).text,
        original.text,
      );
      assert.equal(current.state.notices[0]!.outdated, true);
      const { Event } =
        await import("../../src/modules/events/entities/event.entity.js");
      await db.manager.update(
        Event,
        { id: f.e.id },
        { scheduledAt: new Date("2025-01-01T12:00:00Z") },
      );
      const history = await json<{ events: { id: string; status: string }[] }>(
        await call(`records?groupId=${f.g!.id}&before=2025-12-31`, owner),
      );
      assert.equal(history.events[0]!.id, f.e.id);
      assert.equal(history.events[0]!.status, "IN_PROGRESS");
    },
  );
});

test("confirmed reservation funds are explicitly allocated once, never inferred from a transfer report", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t),
    owner = await signup();
  const { seedDemoRestaurants, demoRestaurantIds } =
    await import("../../src/database/seeds/restaurants-demo.seed.js");
  const { MerchantRepliesService } =
    await import("../../src/modules/reservations/merchant-replies.service.js");
  const { ReservationPaymentsService } =
    await import("../../src/modules/reservations/reservation-payments.service.js");
  await seedDemoRestaurants(db);
  const e = await json<{ id: string; version: number }>(
    await call("events", owner, "POST", {
      name: "예약금 정산",
      creationKey: randomUUID(),
    }),
    201,
  );
  type Inquiry =
    import("../../src/modules/reservations/dto/response/reservation-request.response.dto.js").ReservationRequestDto;
  const q = await json<Inquiry>(
    await call(`events/${e.id}/reservation-requests`, owner, "POST", {
      requestKey: randomUUID(),
      mode: "DIRECT",
      expectedEventVersion: e.version,
      restaurantIds: [demoRestaurantIds[0]],
      conditions: {
        startsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        expectedGuests: 20,
        region: "건대입구",
        seating: "ANY",
        space: "ANY",
      },
      contact: { name: "총무", phone: "01000001234" },
    }),
    201,
  );
  const operator = {
    kind: "operator" as const,
    actor: "pr3-test",
    confirmer: "테스트 사장",
    method: "PHONE" as const,
    confirmedAt: new Date().toISOString(),
    reason: "격리 테스트 확인",
  };
  await app.get(MerchantRepliesService).save(
    q.targets[0]!.id,
    operator,
    {
      requestKey: randomUUID(),
      expectedVersion: 0,
      kind: "AVAILABLE",
      proposal: {
        startsAt: q.snapshot.startsAt,
        expectedGuests: 20,
        seating: "ANY",
        space: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "UNKNOWN", amount: null },
        menuDeadlineAt: null,
        note: "",
        changeCancellationPolicy: "합의 후 처리",
      },
      reason: "",
      holdConfirmed: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    "pr3",
  );
  const latest = (
    await json<{ request: Inquiry }>(
      await call(`events/${e.id}/reservation-requests`, owner),
    )
  ).request;
  const chosen = await json<Inquiry>(
    await call(
      `events/${e.id}/reservation-requests/${q.id}/select`,
      owner,
      "POST",
      {
        requestKey: randomUUID(),
        expectedVersion: latest.version,
        targetId: q.targets[0]!.id,
        revision: 1,
      },
    ),
    201,
  );
  const reservationId = chosen.selection!.id,
    payments = app.get(ReservationPaymentsService);
  const r = await json<{ version: number }>(
    await call(`reservations/${reservationId}`, owner),
  );
  let progress = await payments.guidance(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: r.version,
    kind: "REQUIRED",
    amount: 10000,
    deadline: new Date(Date.now() + 3600000).toISOString(),
    channel: "SMS",
    bank: "테스트은행",
    account: "123-test",
    holder: "가짜매장",
    policy: "합의 후 환불",
    webConsent: false,
  });
  progress = await json<typeof progress>(
    await call(`reservations/${reservationId}/transfer`, owner, "POST", {
      command: {
        requestKey: randomUUID(),
        expectedVersion: progress.version,
        guidanceRevision: progress.guidance.revision,
        payer: "총무",
        amount: 10000,
      },
    }),
  );
  const path = `events/${e.id}/settlement`;
  let v = await json<View>(await call(path, owner));
  assert.equal(v.reservations[0]!.remainingAmount, 0);
  const round = await json<{ id: string }>(
    await call(`events/${e.id}/attendance-rounds`, owner, "POST", {
      title: "1차",
      requestKey: randomUUID(),
    }),
    201,
  );
  const expense = {
    action: "EXPENSE",
    id: randomUUID(),
    roundId: round.id,
    name: "예약금 분할",
    total: 10000,
    deposit: 6000,
    includeDeposit: false,
    support: 4000,
    reservationId,
    memo: "",
    payers: [],
    remainder: null,
    fileIds: [],
  };
  const save = async (c: Record<string, unknown>, status = 200) =>
    json<View>(
      await call(path, owner, "POST", {
        command: {
          requestKey: randomUUID(),
          expectedVersion: v.state.version,
          ...c,
        },
      }),
      status,
    );
  await save(expense, 400);
  progress = await payments.receipt(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    guidanceRevision: progress.guidance.revision,
    amount: 10000,
    receivedAt: new Date().toISOString(),
    corrects: null,
    reason: "실제 은행 확인",
  });
  v = await save(expense);
  assert.equal(v.reservations[0]!.remainingAmount, 10000);
  assert(v.reservations[0]!.restaurantName);
  await save({ ...expense, id: randomUUID() }, 400);
  v = await save({
    ...expense,
    id: randomUUID(),
    deposit: 4000,
    support: 6000,
  });
  assert.equal(
    v.state.expenses.reduce((n, e) => n + e.deposit, 0),
    10000,
  );
  // Releasing one application permits another explicit allocation; it never changes bank facts.
  v = await save({ action: "DELETE_EXPENSE", id: expense.id });
  v = await save({ ...expense, id: randomUUID() });
  assert.equal(v.reservations[0]!.receivedAmount, 10000);
  const notice = {
    action: "NOTICE",
    replaces: null,
    title: "전액 지원",
    message: "정산 내역 확인",
    bank: null,
    saveBank: false,
    deadline: null,
    includePeople: true,
    scope: "ALL",
  };
  v = await save(notice);
  const oldNoticeId = v.state.notices[0]!.id;
  const oldNotice = await json<{ text: string }>(
    await call(`${path}/notices/${oldNoticeId}`, owner),
  );
  assert.match(oldNotice.text, /추가 입금 요청이 없습니다/);
  assert.doesNotMatch(oldNotice.text, /입금 부탁/);
  progress = await payments.receipt(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    guidanceRevision: progress.guidance.revision,
    amount: 5000,
    receivedAt: "2026-01-01T10:00:00.000Z",
    corrects: progress.receipt!.id,
    reason: "은행 수령액 정정",
  });
  v = await json<View>(await call(path, owner));
  assert.equal(v.depositConflicts?.[0]?.applied, 10000);
  assert.equal(v.depositConflicts?.[0]?.remaining, 5000);
  await save(notice, 409);
  const unchanged = await json<{
    text: string;
    refundRequiresRegeneration: boolean;
  }>(await call(`${path}/notices/${oldNoticeId}`, owner));
  assert.equal(unchanged.text, oldNotice.text);
  assert.equal(unchanged.refundRequiresRegeneration, false);
  for (const e of v.state.expenses.filter((e) => !e.deletedAt))
    v = await save({ action: "DELETE_EXPENSE", id: e.id });
  v = await save({
    ...expense,
    id: randomUUID(),
    deposit: 5000,
    support: 5000,
  });
  assert.deepEqual(v.depositConflicts, []);
  const receiptCorrectionOnly = await json<{
    text: string;
    outdated: boolean;
    needsReview: boolean;
    refundRequiresRegeneration: boolean;
  }>(await call(`${path}/notices/${oldNoticeId}`, owner));
  assert.equal(receiptCorrectionOnly.text, oldNotice.text);
  assert.equal(receiptCorrectionOnly.outdated, true);
  assert.equal(receiptCorrectionOnly.needsReview, false);
  assert.equal(receiptCorrectionOnly.refundRequiresRegeneration, false);
  v = await save(notice);
  assert.equal(v.state.notices.length, 2);
  const beforeReturn = v;
  const beforeReturnId = v.state.notices.at(-1)!.id;
  const getNotice = (id: string) =>
    call(`${path}/notices/${id}`, owner).then((r) =>
      json<{
        text: string;
        outdated: boolean;
        needsReview: boolean;
        refundRequiresRegeneration: boolean;
      }>(r),
    );
  const beforeReturnNotice = await getNotice(beforeReturnId);
  const eventSummary = () =>
    call(`settlements/summaries?eventIds=${e.id}`, owner).then((r) =>
      json<{ settlement: { needsReview: boolean; status: string } }[]>(r),
    );
  const eventRecord = () =>
    call("records?offset=0", owner).then((r) =>
      json<{ events: { id: string; needsReview: boolean }[] }>(r),
    );
  assert.equal(beforeReturn.summary.status, "COMPLETE");
  assert.equal(beforeReturnNotice.outdated, false);
  const { ReservationChangesService } =
    await import("../../src/modules/reservations/reservation-changes.service.js");
  const changes = app.get(ReservationChangesService);
  progress = await json(
    await call(`reservations/${reservationId}/change-request`, owner, "POST", {
      command: {
        requestKey: randomUUID(),
        expectedVersion: progress.version,
        kind: "CANCEL",
        subject: "OTHER",
        reason: "합성 취소 협의",
      },
    }),
  );
  progress = await changes.propose(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    changeId: progress.changes[0]!.id,
    reason: "일부 반환 합의",
    refundExpected: null,
  });
  progress = await json(
    await call(`reservations/${reservationId}/change-accept`, owner, "POST", {
      command: {
        requestKey: randomUUID(),
        expectedVersion: progress.version,
        changeId: progress.changes[0]!.id,
        confirmed: true,
      },
    }),
  );
  progress = await changes.refund(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    amount: 1000,
    refundedAt: "2026-01-01T10:00:00.000Z",
    reason: "실제 반환 확인",
  });
  v = await json<View>(await call(path, owner));
  assert.equal(v.depositConflicts?.[0]?.remaining, 4000);
  assert.deepEqual(v.state.expenses, beforeReturn.state.expenses);
  assert.deepEqual(v.summary, beforeReturn.summary);
  assert.equal((await eventSummary())[0]!.settlement.needsReview, true);
  assert.equal(
    (await eventRecord()).events.find((event) => event.id === e.id)
      ?.needsReview,
    true,
  );
  const staleNotice = await getNotice(beforeReturnId);
  assert.equal(staleNotice.text, beforeReturnNotice.text);
  assert.equal(staleNotice.outdated, true);
  assert.equal(staleNotice.needsReview, true);
  assert.equal(staleNotice.refundRequiresRegeneration, true);
  await save(notice, 409);
  await json(
    await call(`events/${e.id}/participants`, owner, "POST", {
      requestKey: randomUUID(),
      members: [{ name: "테스트 참가자", newPersonConfirmed: true }],
      duplicatesConfirmed: true,
    }),
    201,
  );
  const [payer] = await json<Person[]>(
    await call(`events/${e.id}/participants`, owner),
  );
  const activeExpense = v.state.expenses.find((e) => !e.deletedAt)!;
  v = await save({
    ...expense,
    id: activeExpense.id,
    deposit: 4000,
    support: 5000,
    payers: [{ id: payer.id, version: payer.version }],
  });
  assert.deepEqual(v.depositConflicts, []);
  assert.equal(v.summary.people[0]?.amount, 1000);
  assert.equal((await eventSummary())[0]!.settlement.needsReview, false);
  assert.equal(
    (await eventRecord()).events.find((event) => event.id === e.id)
      ?.needsReview,
    false,
  );
  const beforeRegeneration = await getNotice(beforeReturnId);
  assert.equal(beforeRegeneration.needsReview, false);
  assert.equal(beforeRegeneration.outdated, true);
  assert.equal(beforeRegeneration.refundRequiresRegeneration, true);
  assert.equal(beforeRegeneration.text, beforeReturnNotice.text);
  const withBank = {
    ...notice,
    bank: { bank: "테스트은행", account: "1234", holder: "테스트 총무" },
  };
  v = await save({ ...withBank, replaces: beforeReturnId });
  assert.equal(v.state.notices.length, 3);
  const regeneratedId = v.state.notices.at(-1)!.id;
  const regenerated = await getNotice(regeneratedId);
  assert.equal(regenerated.outdated, false);
  assert.equal(regenerated.refundRequiresRegeneration, false);
  assert.match(regenerated.text, /테스트 참가자.*1,000원/);
  assert.deepEqual(await getNotice(beforeReturnId), beforeRegeneration);

  progress = await payments.receipt(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    guidanceRevision: progress.guidance.revision,
    amount: 3500,
    receivedAt: "2026-01-01T10:00:00.000Z",
    corrects: progress.receipt!.id,
    reason: "반환 후 실제 수령액 정정",
  });
  const adjustExpense = (deposit: number) =>
    save({
      ...expense,
      id: activeExpense.id,
      deposit,
      support: 5000,
      payers: [{ id: payer.id, version: payer.version }],
    });
  v = await adjustExpense(2500);
  assert.deepEqual(v.depositConflicts, []);
  assert.equal(v.reservations[0]!.refundedAmount, 1000);
  assert.deepEqual(await getNotice(regeneratedId), {
    ...regenerated,
    outdated: true,
  });

  progress = await payments.receipt(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    guidanceRevision: progress.guidance.revision,
    amount: 3000,
    receivedAt: "2026-01-01T10:00:00.000Z",
    corrects: progress.receipt!.id,
    reason: "가상 수령액 확인",
  });
  v = await adjustExpense(1000);
  v = await save({ ...withBank, replaces: regeneratedId });
  const beforeCombinedChangesId = v.state.notices.at(-1)!.id;
  const beforeCombinedChanges = await getNotice(beforeCombinedChangesId);
  progress = await changes.refund(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    amount: 500,
    // The transfer date predates the notices, but this refund is recorded now.
    refundedAt: "2026-01-02T10:00:00.000Z",
    reason: "추가 반환 뒤늦게 확인",
  });
  v = await json<View>(await call(path, owner));
  assert.equal(v.reservations[0]!.remainingAmount, 1500);
  assert.deepEqual(
    await getNotice(beforeCombinedChangesId),
    beforeCombinedChanges,
  );
  progress = await payments.receipt(reservationId, operator, {
    requestKey: randomUUID(),
    expectedVersion: progress.version,
    guidanceRevision: progress.guidance.revision,
    amount: 1700,
    receivedAt: "2026-01-01T10:00:00.000Z",
    corrects: progress.receipt!.id,
    reason: "추가 반환과 별개로 수령액 정정",
  });
  v = await adjustExpense(200);
  assert.deepEqual(v.depositConflicts, []);
  assert.equal(v.reservations[0]!.remainingAmount, 200);
  // Without the post-notice 500 won refund, the corrected balance would be 700,
  // which still cannot cover the notice's 1,000 won allocation.
  assert.deepEqual(await getNotice(beforeCombinedChangesId), {
    ...beforeCombinedChanges,
    outdated: true,
  });

  v = await save({ ...withBank, replaces: beforeCombinedChangesId });
  const beforeTwoRefundsId = v.state.notices.at(-1)!.id;
  const beforeTwoRefunds = await getNotice(beforeTwoRefundsId);
  for (const amount of [50, 50]) {
    progress = await changes.refund(reservationId, operator, {
      requestKey: randomUUID(),
      expectedVersion: progress.version,
      amount,
      refundedAt: "2026-01-02T10:00:00.000Z",
      reason: "추가 반환 확인",
    });
  }
  v = await adjustExpense(100);
  assert.deepEqual(v.depositConflicts, []);
  assert.equal(v.reservations[0]!.remainingAmount, 100);
  assert.deepEqual(await getNotice(beforeTwoRefundsId), {
    ...beforeTwoRefunds,
    outdated: true,
    refundRequiresRegeneration: true,
  });
  v = await save({ ...withBank, replaces: beforeTwoRefundsId });
  const latestNotice = await getNotice(v.state.notices.at(-1)!.id);
  assert.equal(latestNotice.refundRequiresRegeneration, false);
  assert.equal(latestNotice.outdated, false);
  assert.match(latestNotice.text, /테스트 참가자.*4,900원/);
});
