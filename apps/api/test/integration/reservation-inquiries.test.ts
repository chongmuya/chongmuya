import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import {
  demoRestaurantIds,
  seedDemoRestaurants,
} from "../../src/database/seeds/restaurants-demo.seed.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantSpace } from "../../src/modules/restaurants/entities/restaurant-space.entity.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import { RequestTarget } from "../../src/modules/reservations/entities/request-target.entity.js";

const body = () => ({
  requestKey: randomUUID(),
  mode: "DIRECT",
  expectedEventVersion: 1,
  restaurantIds: [demoRestaurantIds[0], demoRestaurantIds[1]],
  conditions: {
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    expectedGuests: 24,
    region: "건대입구",
    seating: "CLOSE",
    seatingImportance: "PREFERRED",
    space: "HALL",
    spaceImportance: "REQUIRED",
    budgetBasis: "PER_PERSON",
    budgetAmount: 30000,
    alcohol: "UNKNOWN",
    additionalRequests: "늦게 합류하는 사람이 있어요.",
  },
  contact: { name: "문의 담당", phone: "01000001234" },
});

test("planned reservations share the event estimate and one initial attendance round", async (t) => {
  const { app, db, call, signup } = await startResourceApplication(t);
  t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(db);
  const owner = await signup();
  const input = body();
  const create = {
    creationKey: randomUUID(),
    name: "예약하는 행사",
    scheduledAt: input.conditions.startsAt,
    expectedGuests: 24,
  };
  const responses = await Promise.all([
    call("events", owner, "POST", create),
    call("events", owner, "POST", create),
  ]);
  assert.deepEqual(
    responses.map(({ status }) => status),
    [201, 201],
  );
  const [event, retry] = await Promise.all(
    responses.map((response) => response.json()),
  );
  assert.equal(event.id, retry.id);
  const base = `events/${event.id}`;
  const path = `${base}/reservation-requests`;
  assert.equal((await (await call(base, owner)).json()).expectedGuests, 24);
  const attendance = await (
    await call(`${base}/attendance-rounds`, owner)
  ).json();
  assert.equal(attendance.nextTitle, "2차");
  assert.deepEqual(
    attendance.rounds.map(({ title }: { title: string }) => title),
    ["1차"],
  );
  assert.equal(
    await (await call(path, owner)).json().then(({ request }) => request),
    null,
  );
  assert.equal(
    (await call("events", owner, "POST", { ...create, expectedGuests: 25 }))
      .status,
    409,
  );
  assert.equal(
    (
      await call(base, owner, "PATCH", {
        expectedVersion: 1,
        expectedGuests: 25,
      })
    ).status,
    409,
  );
  const modified = await call(path, owner, "POST", {
    ...input,
    conditions: { ...input.conditions, expectedGuests: 25 },
  });
  assert.equal(modified.status, 409);
  assert.equal((await modified.json()).code, "EVENT_EXPECTED_GUESTS_LOCKED");
  const bodyWithoutEstimate = {
    ...input,
    conditions: { ...input.conditions, expectedGuests: undefined },
  };
  const submitted = await call(path, owner, "POST", bodyWithoutEstimate);
  assert.equal(submitted.status, 201);
  assert.equal((await submitted.json()).snapshot.expectedGuests, 24);
  assert.deepEqual(
    await (await call(`${base}/attendance-rounds`, owner)).json(),
    attendance,
  );

  const older = await (
    await call("events", owner, "POST", { name: "기존 행사" })
  ).json();
  const olderBase = `events/${older.id}`;
  const missed = await call(
    `${olderBase}/reservation-requests`,
    owner,
    "POST",
    bodyWithoutEstimate,
  );
  assert.equal(missed.status, 400);
  assert.equal((await missed.json()).code, "EVENT_EXPECTED_GUESTS_REQUIRED");
  const initialized = await call(olderBase, owner, "PATCH", {
    expectedVersion: 1,
    expectedGuests: 18,
  });
  assert.equal(initialized.status, 200);
  assert.equal((await initialized.json()).expectedGuests, 18);
  assert.equal(
    (await (await call(`${olderBase}/attendance-rounds`, owner)).json()).rounds
      .length,
    1,
  );
});

test("public catalog excludes private contacts; one inquiry per owned event, concurrent retries, immutable snapshot and rollback", async (t) => {
  const { app, db, call, signup, logs } = await startResourceApplication(t);
  t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  await seedDemoRestaurants(db);
  await seedDemoRestaurants(db);
  const roomId = randomUUID();
  await db.getRepository(RestaurantSpace).save({
    id: roomId,
    restaurantId: demoRestaurantIds[0]!,
    label: "별도 룸",
    kind: "ROOM",
    availability: "AVAILABLE",
    togetherSeating: "UNKNOWN",
    capacity: 20,
    minGuests: null,
    minSpend: null,
    separateFee: null,
    conditions: "룸 이용 조건은 문의로 확인합니다.",
  });
  assert.equal(await db.getRepository(Restaurant).countBy({ isDemo: true }), 4);
  const a = await signup(),
    b = await signup();
  const makeEvent = async () => {
    const r = await call("events", a, "POST", { name: "일정 없는 개인 행사" });
    assert.equal(r.status, 201);
    return (await r.json()) as { id: string };
  };
  const event = await makeEvent();
  const path = `events/${event.id}/reservation-requests`;
  const catalog = await (await call("restaurants")).json();
  assert.equal(catalog.items.length, 4);
  assert.equal(
    catalog.items.find((r: { id: string }) => r.id === demoRestaurantIds[2])
      .inquiryAvailable,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(catalog),
    /"00000000000"|consentNote|requestConsentAt|contactPhone|contactName/,
  );
  const roomDetail = await (
    await call(`restaurants/${demoRestaurantIds[0]}`)
  ).json();
  assert.deepEqual(
    roomDetail.spaces.find((s: { id: string }) => s.id === roomId),
    {
      id: roomId,
      label: "별도 룸",
      kind: "ROOM",
      availability: "AVAILABLE",
      togetherSeating: "UNKNOWN",
      capacity: 20,
      minGuests: null,
      minSpend: null,
      separateFee: null,
      conditions: "룸 이용 조건은 문의로 확인합니다.",
    },
  );
  const detail = await (
    await call(`restaurants/${demoRestaurantIds[1]}`)
  ).json();
  assert(
    detail.spaces.some(
      (s: { kind: string; availability: string }) =>
        s.kind === "FLOOR" && s.availability === "AVAILABLE",
    ),
  );
  assert.equal(
    (await (await call("restaurants?region=매장없는지역")).json()).items.length,
    0,
  );
  const fixtureBase = await db
    .getRepository(Restaurant)
    .findOneByOrFail({ id: demoRestaurantIds[0] });
  const fixtureIds = [randomUUID(), randomUUID()];
  await db.getRepository(Restaurant).save(
    fixtureIds.map((id, index) => ({
      ...fixtureBase,
      id,
      isDemo: false,
      name: `지역 사진 fixture ${id}`,
      region: index === 0 ? "건대입구" : "세종대",
      latitude: null,
      longitude: null,
      spacePhotos:
        index === 0
          ? [
              {
                path: "/images/restaurants/demo-2.png",
                description: "두 번째 공간",
                position: 2,
              },
              {
                path: "/images/restaurants/demo-1.png",
                description: "첫 번째 공간",
                position: 1,
              },
            ]
          : [],
    })),
  );
  try {
    const unfiltered = await (await call("restaurants")).json();
    for (const id of fixtureIds)
      assert(unfiltered.items.some((r: { id: string }) => r.id === id));
    const photoDetail = await (
      await call(`restaurants/${fixtureIds[0]}`)
    ).json();
    assert.deepEqual(
      photoDetail.spacePhotos.map(
        (photo: { position: number }) => photo.position,
      ),
      [1, 2],
    );
    assert.equal(photoDetail.photoPath, fixtureBase.photoPath);
    assert.equal(photoDetail.latitude, null);
    const empty = await (await call(`restaurants/${fixtureIds[1]}`)).json();
    assert.deepEqual(empty.spacePhotos, []);
    await seedDemoRestaurants(db);
    assert.equal(
      (
        await db
          .getRepository(Restaurant)
          .findOneByOrFail({ id: fixtureIds[0] })
      ).spacePhotos.length,
      2,
    );
  } finally {
    for (const id of fixtureIds) await db.getRepository(Restaurant).delete(id);
  }
  const hidden = randomUUID();
  const original = await db
    .getRepository(Restaurant)
    .findOneByOrFail({ id: demoRestaurantIds[0] });
  await db.getRepository(Restaurant).save({
    ...original,
    id: hidden,
    name: `비공개 매장 ${hidden}`,
    published: false,
    isDemo: false,
  });
  assert.equal((await call(`restaurants/${hidden}`)).status, 404);
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(path, b)).status, 404);
  assert.equal((await call(path, b, "POST", body())).status, 404);
  assert.deepEqual(await (await call(path, a)).json(), { request: null });
  for (const invalid of [
    { ...body(), restaurantIds: [] },
    { ...body(), restaurantIds: [...demoRestaurantIds] },
    { ...body(), restaurantIds: [demoRestaurantIds[0], demoRestaurantIds[0]] },
    {
      ...body(),
      restaurantIds: [
        demoRestaurantIds[0],
        demoRestaurantIds[0]!.toUpperCase(),
      ],
    },
    { ...body(), conditions: [] },
    { ...body(), contact: [] },
    { ...body(), mode: "REVERSE" },
    { ...body(), contact: { name: "담당", phone: "123" } },
    {
      ...body(),
      conditions: { ...body().conditions, startsAt: "2020-01-01T00:00:00Z" },
    },
    {
      ...body(),
      conditions: { ...body().conditions, seatingImportance: null },
    },
    { ...body(), conditions: { ...body().conditions, expectedGuests: 0 } },
    { ...body(), conditions: { ...body().conditions, space: "ROOFTOP" } },
  ])
    assert.equal((await call(path, a, "POST", invalid)).status, 400);
  for (const id of [hidden, demoRestaurantIds[2], randomUUID()])
    assert.equal(
      (await call(path, a, "POST", { ...body(), restaurantIds: [id] })).status,
      409,
    );
  assert.equal(
    await db.getRepository(ReservationRequest).countBy({ eventId: event.id }),
    0,
  );
  const input = body();
  input.conditions.space = "ROOM";
  input.conditions.expectedGuests = 18;
  const responses = await Promise.all([
    call(path, a, "POST", input),
    call(path, a, "POST", input),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [201, 201],
  );
  const [one, two] = await Promise.all(responses.map((r) => r.json()));
  assert.equal(one.id, two.id);
  assert.equal(one.targets.length, 2);
  assert.equal(one.responseCount, 0);
  assert.equal(one.snapshot.space, "ROOM");
  assert(
    one.targets.every(
      (target: { deliveryStatus: string }) =>
        target.deliveryStatus === "PENDING",
    ),
  );
  assert.equal(
    one.contact.phoneVerifiedAt,
    null,
    "changing the contact must not inherit signup verification",
  );
  assert.equal(one.contact.maskedPhone, "010-****-1234");
  assert.doesNotMatch(
    JSON.stringify(one),
    /"00000000000"|01000001234|contactId|consentAt/,
  );
  assert.equal((await call(path, a, "POST", body())).status, 409);
  assert.equal(
    (
      await call(path, a, "POST", {
        ...input,
        conditions: { ...input.conditions, expectedGuests: 25 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(path, a, "PATCH", { conditions: { expectedGuests: 25 } }))
      .status,
    404,
  );
  const currentEvent = await (await call(`events/${event.id}`, a)).json();
  assert.equal(
    (
      await call(`events/${event.id}`, a, "PATCH", {
        name: "변경된 행사",
        scheduledAt: null,
        expectedVersion: currentEvent.version,
      })
    ).status,
    409,
    "active inquiry blocks silent schedule edits",
  );
  assert.equal(
    (
      await call(`events/${event.id}`, a, "PATCH", {
        name: "변경된 행사",
        scheduledAt: currentEvent.scheduledAt,
        expectedVersion: currentEvent.version,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await call(path, a)).json()).request,
    one,
    "event edits must not rewrite submitted conditions",
  );
  assert.equal(
    (await (await call(path, a, "POST", input)).json()).id,
    one.id,
    "lost-response retry survives later event edits",
  );
  const operations = await app
    .get(MessageDeliveryService)
    .listForOperations({ status: "PENDING" });
  assert(
    operations.some(
      (r) =>
        r.request_id === one.id &&
        r.recipient_phone === "00000000000" &&
        !r.holdReasons.length,
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /01000001234|"00000000000"|늦게 합류/,
  );

  const raced = await makeEvent();
  const racedPath = `events/${raced.id}/reservation-requests`;
  const race = await Promise.all([
    call(racedPath, a, "POST", body()),
    call(racedPath, a, "POST", body()),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);

  const failed = await makeEvent();
  // Inject a real DB failure after the parent request INSERT to verify transaction rollback.
  await db.query(
    `CREATE FUNCTION reject_inquiry_target() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM reservation_requests WHERE id = NEW.request_id AND event_id = '${failed.id}') THEN RAISE EXCEPTION 'test target write rejected'; END IF; RETURN NEW; END $$`,
  );
  await db.query(
    "CREATE TRIGGER reject_inquiry_target BEFORE INSERT ON reservation_request_targets FOR EACH ROW EXECUTE FUNCTION reject_inquiry_target()",
  );
  const failedInput = body();
  try {
    assert.equal(
      (
        await call(
          `events/${failed.id}/reservation-requests`,
          a,
          "POST",
          failedInput,
        )
      ).status,
      500,
    );
    assert.equal(
      await db
        .getRepository(ReservationRequest)
        .countBy({ eventId: failed.id }),
      0,
    );
  } finally {
    await db.query(
      "DROP TRIGGER reject_inquiry_target ON reservation_request_targets; DROP FUNCTION reject_inquiry_target()",
    );
  }
  assert.equal(
    (
      await call(
        `events/${failed.id}/reservation-requests`,
        a,
        "POST",
        failedInput,
      )
    ).status,
    201,
  );
  assert.equal(
    await db.getRepository(RequestTarget).countBy({ requestId: one.id }),
    2,
  );

  // Consent withdrawn before submission makes a formerly eligible selection invalid.
  const contact = await db
    .getRepository(RestaurantContact)
    .findOneByOrFail({ restaurantId: demoRestaurantIds[0] });
  await db
    .getRepository(RestaurantContact)
    .update(contact.id, { requestConsentAt: null });
  try {
    const fresh = await makeEvent();
    assert.equal(
      (await call(`events/${fresh.id}/reservation-requests`, a, "POST", body()))
        .status,
      409,
    );
  } finally {
    await db
      .getRepository(RestaurantContact)
      .update(contact.id, { requestConsentAt: contact.requestConsentAt });
  }
  // Live contact changes quarantine the original recipient; history and snapshot never change.
  const targetBefore = await db
    .getRepository(RequestTarget)
    .findBy({ requestId: one.id });
  for (const [change, reason] of [
    [{ requestConsentAt: null }, "CONSENT_WITHDRAWN"],
    [{ active: false }, "CONTACT_INACTIVE"],
    [{ phone: "00000000001" }, "PHONE_CHANGED"],
  ] as const) {
    await db.getRepository(RestaurantContact).update(contact.id, change);
    const pending = await app
      .get(MessageDeliveryService)
      .listForOperations({ status: "PENDING" });
    assert(
      !pending.some(
        (r) =>
          r.request_id === one.id &&
          r.contact_id === contact.id &&
          !r.holdReasons.length,
      ),
    );
    const held = pending.find(
      (r) => r.request_id === one.id && r.contact_id === contact.id,
    )!;
    assert(held.holdReasons.includes(reason));
    assert.equal(held.recipient_phone, contact.phone);
    assert(
      pending.some(
        (r) =>
          r.request_id === one.id &&
          r.contact_id !== contact.id &&
          !r.holdReasons.length,
      ),
    );
    await db.getRepository(RestaurantContact).save(contact);
  }
  await db.getRepository(RestaurantContact).delete(contact.id);
  try {
    await seedDemoRestaurants(db);
    assert.equal(
      await db.getRepository(RestaurantContact).existsBy({ id: contact.id }),
      false,
    );
    const pending = await app
      .get(MessageDeliveryService)
      .listForOperations({ status: "PENDING" });
    assert(
      pending
        .find((r) => r.request_id === one.id && r.contact_id === contact.id)
        ?.holdReasons.includes("CONTACT_DELETED"),
    );
    assert.deepEqual(
      await db.getRepository(RequestTarget).findBy({ requestId: one.id }),
      targetBefore,
    );
    assert.deepEqual((await (await call(path, a)).json()).request, one);
  } finally {
    await db.getRepository(RestaurantContact).save(contact);
  }
});

test("map projection covers the region independently of paginated cards", async (t) => {
  const { db, call } = await startResourceApplication(t);
  const region = `지도-${randomUUID()}`;
  const ids = Array.from({ length: 25 }, () => randomUUID());
  await db.manager.insert(
    Restaurant,
    ids.map((id, i) => ({
      id,
      name: `지도 매장 ${i}`,
      address: `${region} ${i}`,
      region,
      published: true,
      isDemo: true,
      latitude: 37.5 + i / 10000,
      longitude: 127,
    })),
  );
  try {
    const list = await (
      await call(`restaurants?region=${encodeURIComponent(region)}&page=2`)
    ).json();
    assert.equal(list.items.length, 1);
    assert.equal("menus" in list.items[0], false);
    assert.equal("bookingPolicy" in list.items[0], false);
    const map = (await (
      await call(`restaurants/map?region=${encodeURIComponent(region)}`)
    ).json()) as { id: string }[];
    assert.equal(map.length, 25);
    assert.deepEqual(map.map((r) => r.id).sort(), ids.sort());
  } finally {
    for (const id of ids) await db.manager.delete(Restaurant, { id });
  }
});
