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
    deadline: null,
    includePeople: true,
    scope: "ALL",
  };
  state = await post(notice);
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
  state = await post({ ...first, total: 12000 });
  assert.equal(state.summary.people[0]!.remaining, 2000);
  assert.equal(state.summary.received, 10000);
  assert.equal(state.state.notices[0]!.outdated, true);
  state = await post({ ...first, total: 8000 });
  assert.equal(state.summary.people[0]!.excess, 2000);
  const refund = {
    action: "RETURN",
    participantId: f.people[0]!.id,
    amount: 2000,
    reason: "실제 반환 확인",
    requestKey: randomUUID(),
    expectedVersion: state.state.version,
  };
  state = await post(refund);
  state = await post(refund);
  assert.equal(
    state.state.payments.filter((p) => p.kind === "RETURN").length,
    1,
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
  await payments.receipt(reservationId, operator, {
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
});
