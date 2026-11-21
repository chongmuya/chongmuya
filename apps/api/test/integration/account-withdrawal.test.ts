import { KakaoWithdrawalProvider } from "../../src/modules/account-withdrawal/kakao-withdrawal-provider.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { AccountWithdrawalService } from "../../src/modules/account-withdrawal/account-withdrawal.service.js";
import { AccountWithdrawalRequest } from "../../src/modules/account-withdrawal/entities/account-withdrawal-request.entity.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { AuthSession } from "../../src/modules/auth/entities/auth-session.entity.js";
import { ExternalIdentity } from "../../src/modules/auth/entities/external-identity.entity.js";
import { KakaoAttempt } from "../../src/modules/auth/entities/kakao-attempt.entity.js";
import { KAKAO_ISSUER } from "../../src/modules/auth/kakao-oidc.service.js";
import { PasswordReset } from "../../src/modules/auth/entities/password-reset.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { RestaurantsService } from "../../src/modules/restaurants/restaurants.service.js";
import { MerchantRepliesService } from "../../src/modules/reservations/merchant-replies.service.js";
import { MerchantReplyRevision } from "../../src/modules/reservations/entities/merchant-reply.entity.js";
import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import { RequestTarget } from "../../src/modules/reservations/entities/request-target.entity.js";
import {
  ReservationChange,
  ReservationProgress,
} from "../../src/modules/reservations/entities/reservation-progress.entity.js";
import { SelectedReservation } from "../../src/modules/reservations/entities/selected-reservation.entity.js";
import type { Proposal } from "../../src/modules/reservations/types/merchant-reply.js";
import { MessageDelivery } from "../../src/modules/reservations/entities/message-delivery.entity.js";
import { initialSettlement } from "../../src/modules/settlements/types/settlement.js";
import { EventSettlement } from "../../src/modules/settlements/entities/settlement.entity.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import {
  seedDemoRestaurants,
  demoRestaurantIds,
} from "../../src/database/seeds/restaurants-demo.seed.js";
import { startResourceApplication } from "../support/resource-application.js";

const path = "account/withdrawal";
const key = () => ({ requestKey: randomUUID() });
const future = () => new Date(Date.now() + 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const inquiry = () => ({
  ...key(),
  expectedEventVersion: 1,
  mode: "DIRECT",
  restaurantIds: [demoRestaurantIds[0]],
  conditions: {
    startsAt: future(),
    expectedGuests: 24,
    region: "건대입구",
    seating: "ANY",
    space: "ANY",
  },
  contact: { name: "합성 담당", phone: "01000001234" },
});
type Call = Awaited<ReturnType<typeof startResourceApplication>>["call"];
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function createEvent(call: Call, jar: string) {
  const response = await call("events", jar, "POST", {
    name: "탈퇴 검증 행사",
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { id: string }).id;
}

test("requests are idempotent and reviewable; active inquiries block only current responsible accounts; final retry keeps booking, settlement and delivery history", async (t) => {
  const { app, db, call, signup, createGroup } = await startResourceApplication(
    t,
    {
      KAKAO_CLIENT_ID: "test-client",
      KAKAO_CLIENT_SECRET: "test-secret",
      KAKAO_ADMIN_KEY: "isolated-admin-key",
      KAKAO_REDIRECT_URI: "http://localhost:3001/api/v1/auth/kakao/callback",
    },
  );
  t.mock.method(
    app.get(KakaoWithdrawalProvider),
    "inspect",
    async () => "matched",
  );
  t.mock.method(
    app.get(KakaoWithdrawalProvider),
    "unlink",
    async () => "matched",
  );
  const dispatched = t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(db);
  const organizer = await signup();
  const other = await signup();
  const shopOwner = await signup();
  const shopId = (await (await call("auth/me", shopOwner)).json()).id as string;
  await db
    .getRepository(Account)
    .update({ id: shopId }, { accountType: "owner" });
  const ownerInfo = (await (await call("auth/me", organizer)).json()) as {
    id: string;
    email: string;
  };
  const event = await createEvent(call, organizer);
  const reservationPath = `events/${event}/reservation-requests`;
  const closeKey = key();
  assert.deepEqual((await (await call(path, organizer)).json()).blockers, []);
  const created = await call(reservationPath, organizer, "POST", inquiry());
  assert.equal(created.status, 201);
  const requestId = ((await created.json()) as { id: string }).id;
  const target = await db.manager.findOneByOrFail(RequestTarget, { requestId });
  assert.equal((await call(path)).status, 401);
  assert.equal(
    (await call(`${path}/complete`, "", "POST", closeKey)).status,
    401,
  );
  assert.equal((await call(`${path}/requests`, "", "POST", key())).status, 401);
  assert.equal(
    (
      await call(`${path}/complete`, other, "POST", {
        ...key(),
        accountId: ownerInfo.id,
      })
    ).status,
    400,
  );
  assert.deepEqual((await (await call(path, other)).json()).destinations, []);
  const { ownerAccountId: previousOwner } = await db.manager.findOneByOrFail(
    Restaurant,
    { id: demoRestaurantIds[0] },
  );
  await db
    .getRepository(Restaurant)
    .update({ id: demoRestaurantIds[0] }, { ownerAccountId: shopId });
  try {
    const merchantState = await (await call(path, shopOwner)).json();
    assert(merchantState.blockers.includes("OPEN_INQUIRY"));
    assert(merchantState.blockers.includes("RESTAURANT_OWNER"));
    assert(
      merchantState.destinations.includes(
        `/owner/inquiries?target=${target.id}`,
      ),
    );
  } finally {
    await db.manager.update(
      Restaurant,
      { id: demoRestaurantIds[0] },
      { ownerAccountId: previousOwner },
    );
  }
  const before = {
    request: await db.manager.findOneByOrFail(ReservationRequest, {
      id: requestId,
    }),
    target,
    delivery: await db.manager.findBy(MessageDelivery, { targetId: target.id }),
    dispatches: dispatched.mock.callCount(),
  };
  const blocked = await (
    await call(`${path}/complete`, organizer, "POST", closeKey)
  ).json();
  assert.equal(blocked.completed, false);
  assert.deepEqual(blocked.blockers, ["OPEN_INQUIRY"]);
  assert.deepEqual(blocked.destinations, [
    `/events?event=${event}&view=reservation`,
  ]);
  assert.equal(blocked.request, null);
  assert.deepEqual(
    await db.manager.findOneBy(ReservationRequest, { id: requestId }),
    before.request,
  );
  assert.deepEqual(
    await db.manager.findOneBy(RequestTarget, { id: target.id }),
    before.target,
  );
  assert.equal(dispatched.mock.callCount(), before.dispatches);
  const supportKey = key();
  const makeRequest = async (body = supportKey) =>
    (await (await call(`${path}/requests`, organizer, "POST", body)).json())
      .request;
  const [opened, repeated] = await Promise.all([makeRequest(), makeRequest()]);
  assert.deepEqual(opened, repeated);
  const duplicateKey = key();
  assert.equal((await makeRequest(duplicateKey)).id, opened.id);
  const service = app.get(AccountWithdrawalService);
  const pending = await service.listPending();
  assert.deepEqual(pending.find((item) => item.id === opened.id)?.blockers, [
    "OPEN_INQUIRY",
  ]);
  assert.equal(
    (await service.review(opened.id, "isolated-reviewer")).resolution,
    "REVIEWED",
  );
  assert.equal((await makeRequest()).reviewed, true);
  assert.equal((await makeRequest(duplicateKey)).id, opened.id);
  assert.equal((await makeRequest(key())).reviewed, false);

  // A previous organizer credit is history. Current ownership determines access.
  await db.manager.update(
    ReservationRequest,
    { id: requestId },
    { currentContactAccountId: ownerInfo.id, createdById: shopId },
  );
  assert.deepEqual((await (await call(path, shopOwner)).json()).blockers, []);
  await db.manager.update(
    RequestTarget,
    { id: target.id },
    { candidateState: "OPERATOR_CLOSED" },
  );
  assert.deepEqual((await (await call(path, organizer)).json()).blockers, []);
  assert.equal((await call("auth/me", organizer)).status, 200);
  await db.manager.save(EventSettlement, {
    eventId: event,
    state: { ...initialSettlement(), version: 1 },
  });
  const second = await call("auth/login", "", "POST", {
    email: ownerInfo.email,
    password: "group-events-123",
  });
  assert.equal(second.status, 200);
  const secondJar = cookies(second);

  const sub = "1376016924426222222";
  await db.manager.insert(ExternalIdentity, {
    issuer: KAKAO_ISSUER,
    sub,
    accountId: ownerInfo.id,
    createdAt: new Date(),
  });
  const kakaoBrowser = randomBytes(32).toString("base64url");
  await db.manager.insert(KakaoAttempt, {
    browserHash: tokenHash(`kakao-browser:${kakaoBrowser}`),
    id: randomUUID(),
    verifier: "test",
    nonce: "test",
    stateHash: "test",
    purpose: "login",
    status: "verified",
    issuer: KAKAO_ISSUER,
    sub,
    next: "/",
    createdAt: new Date(),
    expiresAt: new Date(future()),
  });
  await db.manager.insert(PasswordReset, {
    hash: tokenHash("isolated-reset"),
    accountId: ownerInfo.id,
    createdAt: new Date(),
    expiresAt: new Date(future()),
    delivery: "sent",
  });

  // Simulate a missing response: discard the success body and replay with the old cookie.
  const closed = await call(`${path}/complete`, organizer, "POST", closeKey);
  assert.equal(closed.status, 200);
  assert.equal(closed.headers.getSetCookie().length, 2);
  assert.equal(
    (await call(`${path}/complete`, organizer, "POST", closeKey)).status,
    401,
  );
  assert.deepEqual(
    await (await call(`${path}/receipt`, "", "POST", closeKey)).json(),
    { completed: true },
  );
  assert.deepEqual(
    await (await call(`${path}/receipt`, other, "POST", key())).json(),
    { completed: false },
  );
  assert.equal((await call("auth/me", secondJar)).status, 401);
  assert.equal((await call("auth/refresh", secondJar, "POST")).status, 401);
  assert.equal(
    (await call("auth/kakao/login", `kakao=${kakaoBrowser}`, "POST", {}))
      .status,
    400,
  );
  assert.equal(
    (
      await call("auth/login", "", "POST", {
        email: ownerInfo.email,
        password: "group-events-123",
      })
    ).status,
    401,
  );

  const account = await db.manager.findOneByOrFail(Account, {
    id: ownerInfo.id,
  });
  assert(account.withdrawnAt);
  assert.equal(account.email, `${ownerInfo.id}@withdrawn.invalid`);
  assert.deepEqual(
    [account.name, account.phone, account.nickname, account.passwordHash],
    [null, null, null, null],
  );
  assert(
    (await db.manager.findBy(AuthSession, { accountId: ownerInfo.id })).every(
      (s) => s.revokedAt,
    ),
  );
  assert.equal(
    await db.manager.countBy(ExternalIdentity, { accountId: ownerInfo.id }),
    0,
  );
  assert.equal(
    await db.manager.countBy(PasswordReset, { accountId: ownerInfo.id }),
    0,
  );
  assert.deepEqual(
    await db.manager.findBy(MessageDelivery, { targetId: target.id }),
    before.delivery,
  );
  assert.deepEqual(
    (await db.manager.findOneByOrFail(EventSettlement, { eventId: event }))
      .state,
    { ...initialSettlement(), version: 1 },
  );
  assert.equal(
    await db.manager.countBy(AccountWithdrawalRequest, { id: opened.id }),
    1,
  );
  assert.equal(
    (await service.listPending()).some(
      (item) => item.accountId === ownerInfo.id,
    ),
    false,
  );
  assert.equal(dispatched.mock.callCount(), before.dispatches);
  const groupOwner = await signup();
  await createGroup("검증용 모임", groupOwner);
  assert.deepEqual(
    (await (await call(`${path}/complete`, groupOwner, "POST", key())).json())
      .blockers,
    ["GROUP_OWNER"],
  );
  assert(
    (await (await call(`${path}/requests`, groupOwner, "POST", key())).json())
      .request,
  );
});

test("selected reservations block through agreed usage or the next Seoul midnight, including server rechecks", async (t) => {
  const seoulMidnight = Date.parse("2030-04-02T00:00:00+09:00");
  t.mock.timers.enable({ apis: ["Date"], now: seoulMidnight - 1 });
  assert(process.env.TEST_DATABASE_URL);
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
  const options = databaseUrl.searchParams.get("options") ?? "";
  databaseUrl.searchParams.set("options", `${options} -c timezone=UTC`.trim());
  const { app, db, call, signup } = await startResourceApplication(t, {
    DATABASE_URL: databaseUrl.toString(),
  });
  assert.deepEqual(await db.query("SHOW TimeZone"), [{ TimeZone: "UTC" }]);
  t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(db);
  const jar = await signup();
  const account = await (await call("auth/me", jar)).json();
  const event = await createEvent(call, jar);
  const settlement = { ...initialSettlement(), version: 1 };
  await db.manager.save(EventSettlement, { eventId: event, state: settlement });
  const blockers = async () => {
    const response = await call(path, jar);
    assert.equal(response.status, 200);
    return (await response.json()).blockers;
  };
  const created = await call(
    `events/${event}/reservation-requests`,
    jar,
    "POST",
    inquiry(),
  );
  assert.equal(created.status, 201);
  const requestId = (await created.json()).id as string;
  const request = await db.manager.findOneByOrFail(ReservationRequest, {
    id: requestId,
  });
  const target = await db.manager.findOneByOrFail(RequestTarget, { requestId });
  const id = randomUUID();
  await db.manager.update(
    ReservationRequest,
    { id: requestId },
    { state: "SELECTED" },
  );
  await db.manager.update(
    RequestTarget,
    { id: target.id },
    { candidateState: "SELECTED" },
  );
  const setSelection = async (
    status: SelectedReservation["status"],
    date: string,
    usageTime?: Proposal["usageTime"],
  ) =>
    db.manager.save(SelectedReservation, {
      id,
      eventId: event,
      requestId,
      targetId: target.id,
      revision: 1,
      version: 1,
      status,
      selectedAt: new Date(),
      selectedBy: account.id,
      cancelledAt: null,
      snapshot: {
        requested: request.snapshot,
        offered: {
          startsAt: date,
          expectedGuests: 24,
          space: "ANY",
          seating: "ANY",
          minimumSpend: null,
          separateFee: null,
          deposit: { kind: "NONE", amount: null },
          menuDeadlineAt: null,
          note: "",
          usageTime,
        },
      },
    });
  for (const status of ["PREPARING", "CHECK_REQUIRED", "CONFIRMED"] as const) {
    await setSelection(status, future());
    assert.deepEqual(await blockers(), ["ACTIVE_RESERVATION"]);
    await setSelection(status, past());
    assert.deepEqual(await blockers(), []);
  }
  const earlierThatDay = "2030-04-01T13:30:00.000Z";
  for (const usageTime of [
    undefined,
    { kind: "UNKNOWN", minutes: null },
    { kind: "UNLIMITED", minutes: null },
    { kind: "MINUTES", minutes: 0 },
  ] as const) {
    const label = usageTime?.kind ?? "missing usage time";
    t.mock.timers.setTime(seoulMidnight - 1);
    await setSelection("CONFIRMED", earlierThatDay, usageTime);
    assert.deepEqual(await blockers(), ["ACTIVE_RESERVATION"], label);
    t.mock.timers.setTime(seoulMidnight);
    assert.deepEqual(await blockers(), [], label);
  }
  t.mock.timers.setTime(seoulMidnight - 1);
  await setSelection("CONFIRMED", earlierThatDay, {
    kind: "MINUTES",
    minutes: 60,
  });
  assert.deepEqual(await blockers(), []);
  await setSelection("CONFIRMED", past(), { kind: "MINUTES", minutes: 60 });
  await db.manager.save(ReservationProgress, {
    reservationId: id,
    state: {
      agreement: {
        startsAt: "2030-04-01T23:32:00+09:00",
        usageTime: { kind: "MINUTES", minutes: 30 },
      },
    },
  });
  const agreedEnd = seoulMidnight + 120_000;
  t.mock.timers.setTime(agreedEnd - 1);
  assert.deepEqual(await blockers(), ["ACTIVE_RESERVATION"]);
  const complete = () => call(`${path}/complete`, jar, "POST", key());
  assert.deepEqual((await (await complete()).json()).blockers, [
    "ACTIVE_RESERVATION",
  ]);
  t.mock.timers.setTime(agreedEnd);
  assert.deepEqual(await blockers(), []);

  await setSelection("CONFIRMED", past());
  await db.manager.save(ReservationProgress, {
    reservationId: id,
    state: { agreement: { startsAt: future() } },
  });
  assert.deepEqual(await blockers(), ["ACTIVE_RESERVATION"]);
  await db.manager.delete(ReservationProgress, { reservationId: id });
  const changeId = randomUUID();
  await db.manager.save(ReservationChange, {
    id: changeId,
    reservationId: id,
    kind: "CHANGE",
    subject: "SCHEDULE",
    status: "PROPOSED",
    reason: "합성 일정 변경",
    createdAt: new Date(),
    proposal: { agreement: { startsAt: future() } },
  });
  assert.deepEqual(await blockers(), ["ACTIVE_RESERVATION"]);
  await db.manager.update(SelectedReservation, { id }, { status: "CANCELLED" });
  assert.deepEqual(await blockers(), []);
  await setSelection("CONFIRMED", future());
  await db.manager.update(
    SelectedReservation,
    { id },
    { cancelledAt: new Date() },
  );
  assert.deepEqual(await blockers(), []);
  await db.manager.update(
    ReservationChange,
    { id: changeId },
    { status: "REJECTED" },
  );
  await setSelection("CONFIRMED", past());
  await db.manager.save(ReservationChange, {
    id: randomUUID(),
    reservationId: id,
    kind: "REFUND",
    subject: "REFUND",
    status: "REQUESTED",
    reason: "합성 반환",
    createdAt: new Date(),
  });
  assert.deepEqual(await blockers(), []);
  assert.deepEqual(await (await complete()).json(), { completed: true });
  assert.equal(
    (await db.manager.findOneByOrFail(SelectedReservation, { id })).status,
    "CONFIRMED",
  );
  assert.deepEqual(
    (await db.manager.findOneByOrFail(EventSettlement, { eventId: event }))
      .state,
    settlement,
  );
});

test("a new inquiry and withdrawal serialize in both orders", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  const dispatched = t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(db);
  const restaurants = app.get(RestaurantsService);
  const auth = app.get(AuthService);
  const getTargets = restaurants.inquiryTargets.bind(restaurants);
  const lockAccount = auth.lockActiveAccount.bind(auth);
  const beforeAccount = gate();
  const continueCreate = gate();
  const targetMock = t.mock.method(
    restaurants,
    "inquiryTargets",
    async (...input: Parameters<typeof getTargets>) => {
      const targets = await getTargets(...input);
      beforeAccount.resolve();
      await continueCreate.promise;
      return targets;
    },
  );
  const jar = await signup();
  const event = await createEvent(call, jar);
  const creation = call(
    `events/${event}/reservation-requests`,
    jar,
    "POST",
    inquiry(),
  );
  await beforeAccount.promise;
  try {
    assert.deepEqual(
      await (await call(`${path}/complete`, jar, "POST", key())).json(),
      { completed: true },
    );
  } finally {
    continueCreate.resolve();
  }
  assert.equal((await creation).status, 401);
  assert.equal(
    await db.manager.countBy(ReservationRequest, { eventId: event }),
    0,
  );
  assert.equal(dispatched.mock.callCount(), 0);
  targetMock.mock.restore();

  const creationHasLock = gate();
  const finishCreate = gate();
  const withdrawalEntering = gate();
  let hits = 0;
  t.mock.method(
    auth,
    "lockActiveAccount",
    async (...input: Parameters<typeof lockAccount>) => {
      const hit = ++hits;
      if (hit === 2) withdrawalEntering.resolve();
      const account = await lockAccount(...input);
      if (hit === 1) {
        creationHasLock.resolve();
        await finishCreate.promise;
      }
      return account;
    },
  );
  const another = await signup();
  const anotherEvent = await createEvent(call, another);
  const first = call(
    `events/${anotherEvent}/reservation-requests`,
    another,
    "POST",
    inquiry(),
  );
  await creationHasLock.promise;
  const second = call(`${path}/complete`, another, "POST", key());
  await withdrawalEntering.promise;
  finishCreate.resolve();
  assert.equal((await first).status, 201);
  assert.deepEqual((await (await second).json()).blockers, ["OPEN_INQUIRY"]);
  assert.equal((await call("auth/me", another)).status, 200);
  assert.equal(dispatched.mock.callCount(), 1);
});

test("reopening a previously declined inquiry requires the same live account lock", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(db);
  const replies = app.get(MerchantRepliesService);
  const organizer = await signup();
  const event = await createEvent(call, organizer);
  const input = inquiry();
  const response = await call(
    `events/${event}/reservation-requests`,
    organizer,
    "POST",
    input,
  );
  assert.equal(response.status, 201);
  const requestId = (await response.json()).id as string;
  const target = await db.manager.findOneByOrFail(RequestTarget, { requestId });
  const operator = {
    kind: "operator",
    actor: "fixture-operator",
    method: "PHONE",
    confirmedAt: new Date().toISOString(),
    reason: "합성 응답",
  } as const;
  const decline = (version: number) =>
    ({
      ...key(),
      expectedVersion: version,
      kind: "DECLINE",
      proposal: null,
      expiresAt: null,
      holdConfirmed: false,
      reason: "가상 불가",
    }) as const;
  const available = (version: number) =>
    ({
      ...key(),
      expectedVersion: version,
      kind: "AVAILABLE",
      proposal: {
        startsAt: input.conditions.startsAt,
        expectedGuests: 24,
        space: "ANY",
        seating: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "UNKNOWN", amount: null },
        menuDeadlineAt: null,
        note: "",
      },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      holdConfirmed: true,
      reason: "",
    }) as const;
  await replies.save(target.id, operator, decline(0), "withdrawal-reopen");
  assert.deepEqual((await (await call(path, organizer)).json()).blockers, []);
  await replies.save(target.id, operator, available(1), "withdrawal-reopen");
  assert.deepEqual(
    (await (await call(`${path}/complete`, organizer, "POST", key())).json())
      .blockers,
    ["OPEN_INQUIRY"],
  );
  await replies.save(target.id, operator, decline(2), "withdrawal-reopen");
  assert.deepEqual(
    await (await call(`${path}/complete`, organizer, "POST", key())).json(),
    { completed: true },
  );
  await assert.rejects(
    replies.save(target.id, operator, available(3), "withdrawal-reopen"),
    { code: "SESSION_INVALID" },
  );
  const current = await db.manager.findOneByOrFail(RequestTarget, {
    id: target.id,
  });
  assert.equal(current.replyVersion, 3);
  assert.equal(
    (
      await db.manager.findOneByOrFail(MerchantReplyRevision, {
        targetId: target.id,
        revision: 3,
      })
    ).kind,
    "DECLINE",
  );
});
