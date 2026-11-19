import { ReservationHandoverService } from "../../src/modules/reservations/reservation-handover.service.js";
import { ReservationProgress } from "../../src/modules/reservations/entities/reservation-progress.entity.js";
import { SelectedReservation } from "../../src/modules/reservations/entities/selected-reservation.entity.js";
import { EventSettlement } from "../../src/modules/settlements/entities/settlement.entity.js";
import { EventFile } from "../../src/modules/files/entities/event-file.entity.js";
import { ReservationNotificationsService } from "../../src/modules/reservations/reservation-notifications.service.js";
import { MessageGateway } from "../../src/modules/reservations/providers/message.gateway.js";
import { MerchantRepliesService } from "../../src/modules/reservations/merchant-replies.service.js";
import { ReservationCompletionService } from "../../src/modules/reservations/reservation-completion.service.js";
import { ReservationPaymentsService } from "../../src/modules/reservations/reservation-payments.service.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import {
  NotificationMessage,
  Notification as InboxNotification,
} from "../../src/modules/notifications/entities/notification.entity.js";
import type { ReservationRequestDto } from "../../src/modules/reservations/dto/response/reservation-request.response.dto.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { startResourceApplication } from "../support/resource-application.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { Group } from "../../src/modules/groups/entities/group.entity.js";
import {
  GroupMembership,
  GroupInvitation,
} from "../../src/modules/groups/entities/group-membership.entity.js";
import { GroupHandover } from "../../src/modules/handovers/entities/group-handover.entity.js";
import { Event } from "../../src/modules/events/entities/event.entity.js";
import { EventsService } from "../../src/modules/events/events.service.js";
import { GroupsService } from "../../src/modules/groups/groups.service.js";
import { FilesService } from "../../src/modules/files/files.service.js";
import { FileStorage } from "../../src/modules/files/file-storage.js";
import { MemoryFileStorage } from "../support/memory-file-storage.js";
import { SettlementsService } from "../../src/modules/settlements/settlements.service.js";
import { CalendarSchedule } from "../../src/modules/calendar/entities/calendar-schedule.entity.js";
import { RemindersService } from "../../src/modules/calendar/reminders.service.js";
import { NotificationsService } from "../../src/modules/notifications/notifications.service.js";
import {
  seedDemoRestaurants,
  demoRestaurantIds,
} from "../../src/database/seeds/restaurants-demo.seed.js";
const json = async <T>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};
const token = () => randomBytes(32).toString("hex");
test("accepted handover preserves private history and personal ownership; memberships and retries never grant early access", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  const a = await signup(),
    b = await signup(),
    c = await signup();
  type Me = { id: string; email: string };
  const aa = await json<Me>(await call("auth/me", a)),
    bb = await json<Me>(await call("auth/me", b)),
    cc = await json<Me>(await call("auth/me", c));
  for (const user of [aa, bb, cc])
    await db.manager.update(
      Account,
      { id: user.id },
      { accountType: "organizer" },
    );
  const creationKey = randomUUID();
  const group = await json<{ id: string }>(
    await call("groups", a, "POST", {
      name: "합성 인수인계 모임",
      creationKey,
      members: [{ name: "가상 참여자", phoneLast4: "0012" }],
    }),
    201,
  );
  const event = await json<{ id: string; version: number }>(
    await call("events", a, "POST", {
      name: "기록을 보존할 행사",
      groupId: group.id,
      creationKey: randomUUID(),
      importGroupRoster: true,
    }),
    201,
  );
  const personal = await json<{ id: string }>(
    await call("events", a, "POST", { name: "개인 행사" }),
    201,
  );
  const people = await json<{ id: string; name: string; version: number }[]>(
    await call(`events/${event.id}/participants`, a),
  );
  const roster = await json<{ id: string; name: string; version: number }[]>(
    await call(`groups/${group.id}/members`, a),
  );
  // Roster identity has no account privileges, and editing never rewrites event snapshots.
  assert.equal(
    (
      await call(`handovers/groups/${group.id}`, a, "POST", {
        targetId: roster[0].id,
        requestKey: randomUUID(),
        token: token(),
        expectedVersion: 1,
      })
    ).status,
    400,
  );
  await json(
    await call(`groups/${group.id}/members/${roster[0].id}`, a, "PATCH", {
      name: "수정된 기본 명단",
      phoneLast4: "0022",
      label: null,
      exclude: true,
      expectedVersion: 1,
      requestKey: randomUUID(),
    }),
  );
  assert.equal(
    (await json<unknown[]>(await call(`groups/${group.id}/members`, a))).length,
    0,
  );
  assert.deepEqual(
    await json(await call(`events/${event.id}/participants`, a)),
    people,
  );
  const inviteToken = token(),
    inviteBody = {
      email: bb.email,
      token: inviteToken,
      requestKey: randomUUID(),
    };
  const invite = await json<{ id: string }>(
    await call(`groups/${group.id}/invitations`, a, "POST", inviteBody),
    201,
  );
  assert.equal(
    (
      await call(`groups/invitations/${invite.id}/accept`, c, "POST", {
        token: inviteToken,
      })
    ).status,
    404,
  );
  const joins = await Promise.all([
    call(`groups/invitations/${invite.id}/accept`, b, "POST", {
      token: inviteToken,
    }),
    call(`groups/invitations/${invite.id}/accept`, b, "POST", {
      token: inviteToken,
    }),
  ]);
  for (const r of joins) await json(r, 201);
  assert.equal(
    await db.manager.countBy(GroupMembership, {
      groupId: group.id,
      accountId: bb.id,
    }),
    1,
  );
  assert.equal((await call(`events/${event.id}`, b)).status, 404);
  assert.equal((await call(`groups/${group.id}/members`, b)).status, 404);
  assert.deepEqual(
    (await json<{ role: string }[]>(await call("groups/memberships", b))).map(
      (g) => g.role,
    ),
    ["MEMBER"],
  );
  assert.equal((await call(`groups/${group.id}/accounts`, b)).status, 404);
  // Cancellation and expiration cannot be bypassed by the correct intended account.
  for (const expire of [false, true]) {
    const tk = token();
    const inv = await json<{ id: string }>(
      await call(`groups/${group.id}/invitations`, a, "POST", {
        email: cc.email,
        token: tk,
        requestKey: randomUUID(),
      }),
      201,
    );
    if (expire)
      await db.manager.update(
        GroupInvitation,
        { id: inv.id },
        { expiresAt: new Date(0) },
      );
    else
      await json(
        await call(
          `groups/${group.id}/invitations/${inv.id}/cancel`,
          a,
          "POST",
          {},
        ),
        201,
      );
    assert.equal(
      (
        await call(`groups/invitations/${inv.id}/accept`, c, "POST", {
          token: tk,
        })
      ).status,
      404,
    );
  }
  await seedDemoRestaurants(db);
  for (const groupId of [undefined, group.id])
    await json(
      await call("favorites", a, "POST", {
        restaurantId: demoRestaurantIds[0],
        saved: true,
        ...(groupId ? { groupId } : {}),
      }),
      201,
    );
  await json(
    await call("favorites", a, "POST", {
      restaurantId: demoRestaurantIds[0],
      groupId: group.id,
      saved: true,
    }),
    201,
  );
  const calendar = await json<{ id: string }>(
    await call("calendar", a, "POST", {
      requestKey: randomUUID(),
      expectedVersion: 0,
      groupId: group.id,
      title: "모임 일정",
      date: "2029-03-01",
      allDay: true,
      memo: "",
    }),
    201,
  );
  const personalCalendar = await json<{ id: string }>(
    await call("calendar", a, "POST", {
      requestKey: randomUUID(),
      expectedVersion: 0,
      title: "개인 일정",
      date: "2029-03-01",
      allDay: true,
      memo: "",
    }),
    201,
  );
  const round = await json<{ id: string }>(
    await call(`events/${event.id}/attendance-rounds`, a, "POST", {
      requestKey: randomUUID(),
      title: "1차",
    }),
    201,
  );
  type View = Awaited<ReturnType<SettlementsService["get"]>>;
  const settlement = `events/${event.id}/settlement`;
  const expense = {
    action: "EXPENSE",
    id: randomUUID(),
    roundId: round.id,
    name: "전체 이용 금액",
    total: 10000,
    deposit: 0,
    includeDeposit: true,
    support: 0,
    reservationId: null,
    memo: "",
    payers: [{ id: people[0].id, version: people[0].version }],
    remainder: null,
    fileIds: [],
  };
  let view = await json<View>(
    await call(settlement, a, "POST", {
      command: { ...expense, requestKey: randomUUID(), expectedVersion: 0 },
    }),
  );
  view = await json<View>(
    await call(settlement, a, "POST", {
      command: {
        action: "NOTICE",
        requestKey: randomUUID(),
        expectedVersion: view.state.version,
        title: "첫 정산문",
        message: "기록 보존",
        bank: { bank: "가상은행", account: "000-111", holder: "기존 총무" },
        saveBank: true,
        deadline: null,
        includePeople: true,
        scope: "ALL",
        replaces: null,
      },
    }),
  );
  const originalSettlement = structuredClone(view.state);
  const draftState = structuredClone(view.state);
  draftState.expenses[0]!.payers = [];
  await db.manager.update(
    EventSettlement,
    { eventId: event.id },
    { state: draftState },
  );
  assert.equal(
    (await app.get(SettlementsService).handoverCounts([event.id], db.manager))
      .incompleteSettlements,
    1,
  );
  const excessState = structuredClone(view.state);
  excessState.payments.push({
    id: randomUUID(),
    participant: excessState.expenses[0]!.payers[0]!,
    kind: "RECEIPT",
    amount: 12000,
    corrects: null,
    reason: "합성 초과 입금",
    actorId: aa.id,
    at: new Date().toISOString(),
    calculationVersion: excessState.calculationVersion,
  });
  await db.manager.update(
    EventSettlement,
    { eventId: event.id },
    { state: excessState },
  );
  assert.equal(
    (await app.get(SettlementsService).handoverCounts([event.id], db.manager))
      .incompleteSettlements,
    1,
  );
  await db.manager.update(
    EventSettlement,
    { eventId: event.id },
    { state: originalSettlement },
  );
  const noticeId = view.state.notices[0].id;
  const oldNotice = await json(
    await call(`${settlement}/notices/${noticeId}`, a),
  );
  const memory = new MemoryFileStorage(),
    storage = app.get(FileStorage);
  storage.put = memory.put.bind(memory);
  storage.get = memory.get.bind(memory);
  storage.delete = memory.delete.bind(memory);
  const fileId = randomUUID();
  const file = {
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    originalname: "합성.pdf",
    mimetype: "application/pdf",
  };
  await app.get(FilesService).upload(aa.id, event.id, fileId, file);
  const handoverToken = token(),
    body = {
      targetId: bb.id,
      token: handoverToken,
      requestKey: randomUUID(),
      expectedVersion: 1,
    };
  const h = await json<{ id: string }>(
    await call(`handovers/groups/${group.id}`, a, "POST", body),
    201,
  );
  assert.equal((await call(`events/${event.id}`, a)).status, 200);
  assert.equal((await call(`events/${event.id}`, b)).status, 404);
  const preview = await json<{
    scope: {
      events: number;
      files: number;
      favorites: number;
      settlements: number;
    };
  }>(
    await call(`handovers/${h.id}/preview`, b, "POST", {
      token: handoverToken,
    }),
    201,
  );
  assert.deepEqual(
    [
      preview.scope.events,
      preview.scope.files,
      preview.scope.favorites,
      preview.scope.settlements,
    ],
    [1, 1, 1, 1],
  );
  const acceptBody = {
    token: handoverToken,
    expectedVersion: 1,
    requestKey: randomUUID(),
  };
  const accepted = await json<{
    id: string;
    status: string;
    completedAt: string;
  }>(await call(`handovers/${h.id}/accept`, b, "POST", acceptBody), 201);
  assert.deepEqual(Object.keys(accepted).sort(), [
    "completedAt",
    "id",
    "status",
  ]);
  assert.deepEqual(
    await json(
      await call(`handovers/${h.id}/accept`, b, "POST", acceptBody),
      201,
    ),
    accepted,
  );
  assert.equal(
    (
      await call(`handovers/${h.id}/accept`, b, "POST", {
        ...acceptBody,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`handovers/${h.id}/accept`, a, "POST", acceptBody)).status,
    404,
  );
  assert.equal(
    await db.manager.countBy(GroupHandover, {
      groupId: group.id,
      status: "ACCEPTED",
    }),
    1,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(Group, { id: group.id })).creatorId,
    aa.id,
  );
  const storedEvent = await db.manager.findOneByOrFail(Event, { id: event.id });
  assert.equal(storedEvent.creatorId, aa.id);
  assert.equal(storedEvent.ownerId, bb.id);
  assert.equal(
    (
      await db.manager.findOneByOrFail(GroupMembership, {
        groupId: group.id,
        accountId: aa.id,
      })
    ).role,
    "MEMBER",
  );
  for (const path of [
    `groups/${group.id}`,
    `groups/${group.id}/members`,
    `events/${event.id}`,
    `events/${event.id}/participants`,
    settlement,
    `${settlement}/notices/${noticeId}`,
    `events/${event.id}/files`,
    `events/${event.id}/files/${fileId}/download`,
    `calendar/${calendar.id}`,
    `favorites?groupId=${group.id}`,
  ]) {
    assert.equal((await call(path, a)).status, 404, path);
    assert.equal((await call(path, b)).status, 200, path);
  }
  assert.equal((await call(`events/${personal.id}`, a)).status, 200);
  assert.equal((await call(`events/${personal.id}`, b)).status, 404);
  assert.equal((await call(`calendar/${personalCalendar.id}`, a)).status, 200);
  assert.equal((await call(`calendar/${personalCalendar.id}`, b)).status, 404);
  assert.equal((await json<unknown[]>(await call("favorites", a))).length, 1);
  assert.equal((await json<unknown[]>(await call("favorites", b))).length, 0);
  const newView = await json<View>(await call(settlement, b));
  assert.equal(newView.bankDefault, null);
  const inheritedNotice = await json<Record<string, unknown>>(
    await call(`${settlement}/notices/${noticeId}`, b),
  );
  assert.deepEqual(
    { ...inheritedNotice, outdated: false },
    { ...(oldNotice as object), outdated: false },
  );
  assert.equal(inheritedNotice.outdated, true);
  // Creation receipt belongs to the original creator and cannot leak transferred payload.
  assert.equal(
    (
      await call("groups", a, "POST", {
        name: "합성 인수인계 모임",
        creationKey,
        members: [{ name: "가상 참여자", phoneLast4: "0012" }],
      })
    ).status,
    404,
  );
  await db.manager.update(
    CalendarSchedule,
    { id: calendar.id },
    { scheduleUpdatedAt: new Date("2029-02-27T00:00:00Z") },
  );
  await app.get(RemindersService).run(new Date("2029-02-28T00:01:00Z"));
  const inbox = await app.get(NotificationsService).inbox(bb.id);
  assert(
    inbox.items.some(
      (n) => n.destination === `/calendar?schedule=${calendar.id}`,
    ),
  );
  assert(
    !(await app.get(NotificationsService).inbox(aa.id)).items.some(
      (n) => n.destination === `/calendar?schedule=${calendar.id}`,
    ),
  );
  // New admin can actually mutate inherited resources, not merely list them.
  await app.get(GroupsService).addMembers(bb.id, group.id, {
    requestKey: randomUUID(),
    members: [{ name: "새 명단" }],
  });
  await app.get(EventsService).update(bb.id, event.id, {
    expectedVersion: storedEvent.version,
    name: "새 총무의 행사 수정",
  });
});

test("group lock serializes handover against stale writers, upload completion and competing handovers", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  const a = await signup(),
    b = await signup(),
    c = await signup();
  const aa = await json<{ id: string; email: string }>(
      await call("auth/me", a),
    ),
    bb = await json<{ id: string; email: string }>(await call("auth/me", b)),
    cc = await json<{ id: string; email: string }>(await call("auth/me", c));
  for (const u of [aa, bb, cc])
    await db.manager.update(
      Account,
      { id: u.id },
      { accountType: "organizer" },
    );
  const g = await json<{ id: string }>(
    await call("groups", a, "POST", { name: "경합 합성 모임" }),
    201,
  );
  for (const [u, jar] of [
    [bb, b],
    [cc, c],
  ] as const) {
    const tk = token();
    const inv = await json<{ id: string }>(
      await call(`groups/${g.id}/invitations`, a, "POST", {
        email: u.email,
        token: tk,
        requestKey: randomUUID(),
      }),
      201,
    );
    await json(
      await call(`groups/invitations/${inv.id}/accept`, jar, "POST", {
        token: tk,
      }),
      201,
    );
  }
  const e = await json<{ id: string; version: number }>(
    await call("events", a, "POST", { name: "경합 행사", groupId: g.id }),
    201,
  );
  const schedule = await json<{ id: string; version: number }>(
    await call("calendar", a, "POST", {
      requestKey: randomUUID(),
      expectedVersion: 0,
      groupId: g.id,
      title: "경합 일정",
      date: "2029-03-01",
      allDay: true,
      memo: "",
    }),
    201,
  );
  const bt = token(),
    ct = token();
  const [ab, ac] = await Promise.all([
    call(`handovers/groups/${g.id}`, a, "POST", {
      targetId: bb.id,
      token: bt,
      requestKey: randomUUID(),
      expectedVersion: 1,
    }),
    call(`handovers/groups/${g.id}`, a, "POST", {
      targetId: cc.id,
      token: ct,
      requestKey: randomUUID(),
      expectedVersion: 1,
    }),
  ]);
  assert.deepEqual([ab.status, ac.status].sort(), [201, 409]);
  const winner =
    ab.status === 201
      ? { jar: b, user: bb, token: bt, response: ab }
      : { jar: c, user: cc, token: ct, response: ac };
  const h = await json<{ id: string }>(winner.response, 201);
  const storage = app.get(FileStorage),
    memory = new MemoryFileStorage();
  let releaseUpload!: () => void, startedUpload!: () => void;
  const uploadGate = new Promise<void>((r) => (releaseUpload = r)),
    uploadStarted = new Promise<void>((r) => (startedUpload = r));
  storage.put = async (key, body) => {
    startedUpload();
    await uploadGate;
    await memory.put(key, body);
  };
  const delayedFileId = randomUUID();
  const upload = app
    .get(FilesService)
    .upload(aa.id, e.id, delayedFileId, {
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
      originalname: "지연.pdf",
      mimetype: "application/pdf",
    })
    .then(
      () => 200,
      (error: { getStatus: () => number }) => error.getStatus(),
    );
  await uploadStarted;
  const events = app.get(EventsService),
    original = events.transferGroup.bind(events);
  let entered!: () => void, release!: () => void;
  const enteredPromise = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r));
  events.transferGroup = async (...args) => {
    const result = await original(...args);
    entered();
    await gate;
    return result;
  };
  t.after(() => {
    events.transferGroup = original;
    releaseUpload();
    release();
  });
  const acceptance = call(`handovers/${h.id}/accept`, winner.jar, "POST", {
    token: winner.token,
    requestKey: randomUUID(),
    expectedVersion: 1,
  });
  await enteredPromise;
  let finished = 0;
  const staleWrites = [
    call(`events/${e.id}`, a, "PATCH", {
      name: "늦은 변경",
      expectedVersion: e.version,
    }),
    call(`groups/${g.id}/members`, a, "POST", {
      requestKey: randomUUID(),
      members: [{ name: "늦은 명단" }],
    }),
    call(`events/${e.id}/settlement`, a, "POST", {
      command: {
        action: "MEMO",
        memo: "늦은 정산",
        requestKey: randomUUID(),
        expectedVersion: 0,
      },
    }),
    call(`calendar/${schedule.id}`, a, "POST", {
      requestKey: randomUUID(),
      expectedVersion: 1,
      groupId: g.id,
      title: "늦은 일정",
      date: "2029-03-01",
      allDay: true,
      memo: "",
    }),
  ].map((p) =>
    p.then((r) => {
      finished++;
      return r;
    }),
  );
  // Real requests are blocked on the group row until acceptance commits.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(finished, 0);
  release();
  await json(await acceptance, 201);
  releaseUpload();
  assert.equal(await upload, 404);
  const completedFile = await db.manager.findOneByOrFail(EventFile, {
    id: delayedFileId,
  });
  assert.equal(completedFile.status, "READY");
  assert.equal(completedFile.actorId, aa.id);
  storage.get = memory.get.bind(memory);
  assert.equal(
    (await app.get(FilesService).download(winner.user.id, e.id, delayedFileId))
      .body.byteLength,
    completedFile.size,
  );
  const fileNotice = await db.manager.findOneByOrFail(InboxNotification, {
    eventKey: `file:${delayedFileId}`,
  });
  assert.equal(fileNotice.accountId, winner.user.id);
  for (const r of await Promise.all(staleWrites)) assert.equal(r.status, 404);
  assert.equal(
    (await db.manager.findOneByOrFail(Event, { id: e.id })).name,
    "경합 행사",
  );
  assert.equal(
    (await db.manager.findOneByOrFail(CalendarSchedule, { id: schedule.id }))
      .ownerId,
    winner.user.id,
  );
  assert.equal(
    await db.manager.countBy(GroupMembership, { groupId: g.id, role: "ADMIN" }),
    1,
  );
});

test("forward migration backfills known creators and admin membership without rewriting historical rows", async (t) => {
  const { db } = await startResourceApplication(t);
  const q = db.createQueryRunner();
  await q.connect();
  await q.startTransaction();
  try {
    const schema = `handover_${randomUUID().replaceAll("-", "")}`;
    await q.query(`CREATE SCHEMA ${schema}`);
    await q.query(`SET LOCAL search_path TO ${schema}`);
    const migrations = [...db.migrations].sort((a, b) =>
      a.constructor.name
        .slice(-13)
        .localeCompare(b.constructor.name.slice(-13)),
    );
    const upgrade = migrations.find((m) =>
      m.constructor.name.startsWith("GroupHandover"),
    )!;
    for (const m of migrations) {
      if (m === upgrade) break;
      await m.up(q);
    }
    const a = randomUUID(),
      g = randomUUID(),
      e = randomUUID(),
      p = randomUUID();
    await q.query(
      `INSERT INTO accounts(id,email,"passwordHash","createdAt") VALUES($1,'upgrade@example.test','hash',now())`,
      [a],
    );
    await q.query(
      `INSERT INTO groups(id,owner_id,name,created_at,creation_key) VALUES($1,$2,'기존 모임',now(),$3)`,
      [g, a, randomUUID()],
    );
    await q.query(
      `INSERT INTO events(id,owner_id,group_id,name,created_at) VALUES($1,$2,$3,'모임 행사',now()),($4,$2,null,'개인 행사',now())`,
      [e, a, g, p],
    );
    const before = await q.query("SELECT * FROM events ORDER BY id");
    await upgrade.up(q);
    assert.deepEqual(
      await q.query("SELECT * FROM events ORDER BY id"),
      before.map((r: object) => ({ ...r, creator_id: a })),
    );
    const [membership] = await q.query("SELECT * FROM group_memberships");
    assert.equal(membership.account_id, a);
    assert.equal(membership.role, "ADMIN");
    assert.equal(membership.group_id, g);
    assert.deepEqual(await q.query("SELECT * FROM group_members"), []);
    await assert.rejects(upgrade.down(q));
  } finally {
    await q.rollbackTransaction();
    await q.release();
  }
});

test("reservation selection race, current merchant contact, pending SMS replanning and real receipt audit survive handover", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  await seedDemoRestaurants(db);
  const a = await signup(),
    b = await signup();
  const aa = await json<{ id: string; email: string }>(
      await call("auth/me", a),
    ),
    bb = await json<{ id: string; email: string }>(await call("auth/me", b));
  await db.manager.update(Account, { id: aa.id }, { accountType: "organizer" });
  await db.manager.update(
    Account,
    { id: bb.id },
    { accountType: "organizer", name: "새 합성 총무", phone: "01000009999" },
  );
  const g = await json<{ id: string }>(
      await call("groups", a, "POST", { name: "예약 모임" }),
      201,
    ),
    tk = token();
  const inv = await json<{ id: string }>(
    await call(`groups/${g.id}/invitations`, a, "POST", {
      email: bb.email,
      token: tk,
      requestKey: randomUUID(),
    }),
    201,
  );
  await json(
    await call(`groups/invitations/${inv.id}/accept`, b, "POST", { token: tk }),
    201,
  );
  const e = await json<{ id: string; version: number }>(
    await call("events", a, "POST", { name: "합성 예약 흐름", groupId: g.id }),
    201,
  );
  const inquiry = await json<ReservationRequestDto>(
    await call(`events/${e.id}/reservation-requests`, a, "POST", {
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
      contact: { name: "원래 합성 총무", phone: "01000001111" },
    }),
    201,
  );
  const operator = {
    kind: "operator" as const,
    actor: "test-recorder",
    confirmer: "합성 매장",
    method: "PHONE" as const,
    confirmedAt: new Date().toISOString(),
    reason: "격리 테스트",
  };
  await app.get(MerchantRepliesService).save(
    inquiry.targets[0].id,
    operator,
    {
      requestKey: randomUUID(),
      expectedVersion: 0,
      kind: "AVAILABLE",
      proposal: {
        startsAt: inquiry.snapshot.startsAt,
        expectedGuests: 20,
        seating: "ANY",
        space: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "UNKNOWN", amount: null },
        menuDeadlineAt: null,
        note: "",
        changeCancellationPolicy: "합의 기록",
      },
      reason: "",
      holdConfirmed: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    "handover-test",
  );
  const scopeService = app.get(ReservationHandoverService);
  assert.deepEqual(await scopeService.ongoing([e.id], db.manager), {
    ongoingInquiries: 1,
    ongoingReservations: 0,
  });
  const originalRequest = await db.manager.findOneByOrFail(ReservationRequest, {
    id: inquiry.id,
  });
  const notices = app.get(NotificationsService);
  const facts: string[] = [];
  for (const status of ["PENDING", "UNKNOWN", "ACCEPTED", "PENDING"]) {
    const eventKey = `handover-test:${randomUUID()}`;
    facts.push(eventKey);
    await db.transaction((m) =>
      notices.record(m, {
        eventKey,
        kind: "RESERVATION_UPDATED",
        eventId: e.id,
        requestId: inquiry.id,
        revision: 1,
        accounts: [],
        messages: [
          {
            recipientKey: `organizer:${aa.id}`,
            phone: "01000001111",
            text: "합성 알림",
            isDemo: true,
          },
        ],
      }),
    );
    if (status !== "PENDING")
      await db.manager.update(
        NotificationMessage,
        { eventKey },
        { status, provider: "fake", providerMessageId: `preserve-${status}` },
      );
  }
  const claimedMessage = await db.manager.findOneByOrFail(NotificationMessage, {
    eventKey: facts[3],
  });
  const claim = notices.claim.bind(notices);
  let claimReached!: () => void, releaseClaim!: () => void;
  const claimed = new Promise<void>((r) => (claimReached = r)),
    claimGate = new Promise<void>((r) => (releaseClaim = r));
  notices.claim = async (...args) => {
    const result = await claim(...args);
    if (args[0] === claimedMessage.id && result) {
      claimReached();
      await claimGate;
    }
    return result;
  };
  const gateway = app.get(MessageGateway),
    send = gateway.send.bind(gateway),
    submitted: string[] = [];
  gateway.send = async (...args) => {
    submitted.push(args[0]);
    return send(...args);
  };
  t.after(() => {
    notices.claim = claim;
    gateway.send = send;
    releaseClaim();
  });
  const delayedDispatch = app
    .get(ReservationNotificationsService)
    .dispatch(claimedMessage.id);
  await claimed;
  const immutable = await db.manager.findBy(NotificationMessage, {
    eventKey: facts[1],
  });
  const ht = token(),
    h = await json<{ id: string }>(
      await call(`handovers/groups/${g.id}`, a, "POST", {
        targetId: bb.id,
        token: ht,
        requestKey: randomUUID(),
        expectedVersion: 1,
      }),
      201,
    );
  const eventService = app.get(EventsService),
    original = eventService.transferGroup.bind(eventService);
  let entered!: () => void, release!: () => void;
  const entry = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r));
  eventService.transferGroup = async (...args) => {
    const rows = await original(...args);
    entered();
    await gate;
    return rows;
  };
  t.after(() => {
    eventService.transferGroup = original;
    release();
  });
  const acceptance = call(`handovers/${h.id}/accept`, b, "POST", {
    token: ht,
    requestKey: randomUUID(),
    expectedVersion: 1,
  });
  await entry;
  const oldSelection = call(
    `events/${e.id}/reservation-requests/${inquiry.id}/select`,
    a,
    "POST",
    {
      requestKey: randomUUID(),
      expectedVersion: originalRequest.version,
      targetId: inquiry.targets[0].id,
      revision: 1,
    },
  );
  const reminder = app.get(RemindersService).run(new Date());
  release();
  await json(await acceptance, 201);
  assert.equal((await oldSelection).status, 404);
  releaseClaim();
  await delayedDispatch;
  assert(!submitted.includes(claimedMessage.id));
  const replanned = await db.manager.findBy(NotificationMessage, {
    eventKey: facts[3],
  });
  assert.equal(replanned.length, 2);
  assert.equal(
    replanned.find((r) => r.id === claimedMessage.id)?.errorCode,
    "RECIPIENT_CHANGED",
  );
  assert(
    replanned.some(
      (r) => r.phoneSnapshot === "01000009999" && r.status === "ACCEPTED",
    ),
  );

  await reminder;
  const updated = await db.manager.findOneByOrFail(ReservationRequest, {
    id: inquiry.id,
  });
  assert.equal(updated.contactName, originalRequest.contactName);
  assert.equal(updated.contactPhone, originalRequest.contactPhone);
  assert.deepEqual(updated.snapshot, originalRequest.snapshot);
  assert.equal(updated.currentContactAccountId, bb.id);
  assert.equal(updated.currentContactPhone, "01000009999");
  assert.equal(updated.contactChanges.length, 1);
  const merchant = await app
    .get(MerchantRepliesService)
    .get(inquiry.targets[0].id, operator);
  assert.equal(merchant.organizerName, "새 합성 총무");
  assert.equal(merchant.organizerMaskedPhone, "010-****-9999");
  assert(merchant.contactChangedAt);
  const pending = await db.manager.findBy(NotificationMessage, {
    eventKey: facts[0],
  });
  assert.equal(pending.length, 2);
  assert.equal(
    pending.find((r) => r.recipientKey === `organizer:${aa.id}`)?.errorCode,
    "RECIPIENT_CHANGED",
  );
  assert(
    pending.some(
      (r) => r.phoneSnapshot === "01000009999" && r.status === "ACCEPTED",
    ),
  );
  assert.deepEqual(
    await db.manager.findBy(NotificationMessage, { eventKey: facts[1] }),
    immutable,
  );
  assert.equal(
    (await db.manager.findBy(NotificationMessage, { eventKey: facts[2] }))
      .length,
    1,
  );
  const selected = await json<ReservationRequestDto>(
    await call(
      `events/${e.id}/reservation-requests/${inquiry.id}/select`,
      b,
      "POST",
      {
        requestKey: randomUUID(),
        expectedVersion: updated.version,
        targetId: inquiry.targets[0].id,
        revision: 1,
      },
    ),
    201,
  );
  const id = selected.selection!.id,
    completion = app.get(ReservationCompletionService),
    payments = app.get(ReservationPaymentsService);
  let view = await completion.get(id, operator);
  view = await payments.guidance(id, operator, {
    requestKey: randomUUID(),
    expectedVersion: view.version,
    kind: "REQUIRED",
    amount: 10000,
    deadline: new Date(Date.now() + 3600000).toISOString(),
    channel: "WEB",
    bank: "합성은행",
    account: "000111",
    holder: "합성매장",
    policy: "합의 기록",
    webConsent: true,
  });
  type Completion = Awaited<ReturnType<ReservationCompletionService["get"]>>;
  view = await json<Completion>(
    await call(`reservations/${id}/menu-submit`, b, "POST", {
      command: {
        requestKey: randomUUID(),
        expectedVersion: view.version,
        catalogVersion: view.catalog.version,
        items: [
          {
            id: view.catalog.menus.find((m) => m.price !== null && m.available)!
              .id,
            quantity: 2,
          },
        ],
        guidanceRevision: view.guidance.revision,
        confirmed: true,
      },
    }),
  );
  assert.notEqual(view.status, "CONFIRMED");
  view = await payments.receipt(id, operator, {
    requestKey: randomUUID(),
    expectedVersion: view.version,
    amount: 10000,
    guidanceRevision: view.guidance.revision,
    receivedAt: new Date().toISOString(),
    corrects: null,
    reason: "가짜 은행 대조 기록",
  });
  assert.equal(view.status, "CONFIRMED");
  assert.deepEqual(await scopeService.ongoing([e.id], db.manager), {
    ongoingInquiries: 0,
    ongoingReservations: 1,
  });
  const progress = await db.manager.findOneByOrFail(ReservationProgress, {
    reservationId: id,
  });
  progress.state.agreement.startsAt = "2000-01-01T00:00:00Z";
  await db.manager.save(progress);
  assert.equal(
    (await scopeService.ongoing([e.id], db.manager)).ongoingReservations,
    0,
  );
  await db.manager.update(
    SelectedReservation,
    { id },
    { status: "CHECK_REQUIRED" },
  );
  assert.equal(
    (await scopeService.ongoing([e.id], db.manager)).ongoingReservations,
    1,
  );

  assert.equal(view.receipt?.audit.recorder, "test-recorder");
  assert.equal(view.currentContact.name, "새 합성 총무");
  assert.equal((await call(`reservations/${id}`, a)).status, 404);
  assert.equal((await call(`reservations/${id}`, b)).status, 200);
});

test("handover cancellation, expiry, membership loss and stale group version block acceptance; old completion replay stays minimal", async (t) => {
  const { db, call, signup } = await startResourceApplication(t);
  const a = await signup(),
    b = await signup();
  const aa = await json<{ id: string; email: string }>(
      await call("auth/me", a),
    ),
    bb = await json<{ id: string; email: string }>(await call("auth/me", b));
  for (const u of [aa, bb])
    await db.manager.update(
      Account,
      { id: u.id },
      { accountType: "organizer" },
    );
  const g = await json<{ id: string }>(
      await call("groups", a, "POST", { name: "수락 검증 모임" }),
      201,
    ),
    it = token();
  const invite = await json<{ id: string }>(
    await call(`groups/${g.id}/invitations`, a, "POST", {
      email: bb.email,
      requestKey: randomUUID(),
      token: it,
    }),
    201,
  );
  await json(
    await call(`groups/invitations/${invite.id}/accept`, b, "POST", {
      token: it,
    }),
    201,
  );
  let version = 1;
  for (const failure of ["cancel", "expiry", "membership", "version"]) {
    const tk = token(),
      h = await json<{ id: string }>(
        await call(`handovers/groups/${g.id}`, a, "POST", {
          requestKey: randomUUID(),
          targetId: bb.id,
          token: tk,
          expectedVersion: version,
        }),
        201,
      );
    if (failure === "cancel")
      await json(
        await call(`handovers/groups/${g.id}/${h.id}/cancel`, a, "POST", {}),
        201,
      );
    if (failure === "expiry")
      await db.manager.update(
        GroupHandover,
        { id: h.id },
        { expiresAt: new Date(0) },
      );
    if (failure === "membership")
      await db.manager.delete(GroupMembership, {
        groupId: g.id,
        accountId: bb.id,
      });
    if (failure === "version")
      await db.manager.update(Group, { id: g.id }, { version: ++version });
    assert(
      [400, 409].includes(
        (
          await call(`handovers/${h.id}/accept`, b, "POST", {
            requestKey: randomUUID(),
            token: tk,
            expectedVersion: failure === "version" ? version - 1 : version,
          })
        ).status,
      ),
    );
    assert.equal(
      (await db.manager.findOneByOrFail(Group, { id: g.id })).ownerId,
      aa.id,
    );
    if (failure === "membership")
      await db.manager.insert(GroupMembership, {
        groupId: g.id,
        accountId: bb.id,
        role: "MEMBER",
        joinedAt: new Date(),
      });
    await json(
      await call(`handovers/groups/${g.id}/${h.id}/cancel`, a, "POST", {}),
      201,
    );
  }
  const tk = token(),
    h = await json<{ id: string }>(
      await call(`handovers/groups/${g.id}`, a, "POST", {
        requestKey: randomUUID(),
        targetId: bb.id,
        token: tk,
        expectedVersion: version,
      }),
      201,
    );
  const original = {
    requestKey: randomUUID(),
    token: tk,
    expectedVersion: version,
  };
  const receipt = await json(
    await call(`handovers/${h.id}/accept`, b, "POST", original),
    201,
  );
  const backToken = token(),
    back = await json<{ id: string }>(
      await call(`handovers/groups/${g.id}`, b, "POST", {
        requestKey: randomUUID(),
        targetId: aa.id,
        token: backToken,
        expectedVersion: version + 1,
      }),
      201,
    );
  await json(
    await call(`handovers/${back.id}/accept`, a, "POST", {
      requestKey: randomUUID(),
      token: backToken,
      expectedVersion: version + 1,
    }),
    201,
  );
  assert.equal((await call(`groups/${g.id}/members`, b)).status, 404);
  assert.deepEqual(
    await json(
      await call(`handovers/${h.id}/accept`, b, "POST", original),
      201,
    ),
    receipt,
  );
  assert.deepEqual(Object.keys(receipt as object).sort(), [
    "completedAt",
    "id",
    "status",
  ]);
});
