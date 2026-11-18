import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import {
  seedDemo,
  demoId,
  demoAccounts,
} from "../../src/database/seeds/demo.seed.js";
import { demoLinks } from "../../src/database/seeds/demo-links.seed.js";
import { merchantEncryptionKey } from "../../src/modules/reservations/lib/merchant-link-codec.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { Event } from "../../src/modules/events/entities/event.entity.js";
import { AttendanceResponse } from "../../src/modules/events/entities/attendance-response.entity.js";
import { AttendanceReview } from "../../src/modules/events/entities/attendance-review.entity.js";
import { EventParticipant } from "../../src/modules/events/entities/event-participant.entity.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import { RequestTarget } from "../../src/modules/reservations/entities/request-target.entity.js";
import { MessageDelivery } from "../../src/modules/reservations/entities/message-delivery.entity.js";
import { MessageGateway } from "../../src/modules/reservations/providers/message.gateway.js";
import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import { ConfigService } from "../../src/config/config.service.js";

const read = async (r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b;
};
test("offline demo seed preserves edits/deletions, logs in normally, isolates resources, serves demo links", async (t) => {
  const { app, db, call, url } = await startResourceApplication(t);
  const key = merchantEncryptionKey(app.get(ConfigService).environment);
  const options = {
    password: "Demo1234!",
    set: `integration-${randomUUID().slice(0, 8)}`,
    encryptionKey: key,
  };
  const outside = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("seed must not use HTTP");
  });
  const first = await seedDemo(db, options);
  assert(first.counts.created > 0);
  const participantId = demoId(`set:${options.set}:participant:19`);
  await db.manager.delete(EventParticipant, { id: participantId });
  const deletedReview = demoId(`set:${options.set}:review:missing`);
  await db.manager.delete(AttendanceReview, { id: deletedReview });
  await db.manager.delete(AttendanceResponse, {
    roundId: demoId(`set:${options.set}:round:0`),
    participantId: demoId(`set:${options.set}:participant:0`),
  });
  const oldAccount = await db.manager.findOneByOrFail(Account, {
    id: demoAccounts[0]!.id,
  });
  await db.manager.update(
    Account,
    { id: oldAccount.id },
    { nickname: "내가 수정", phoneVerifiedAt: null },
  );
  const again = await seedDemo(db, { ...options, password: "different-123" });
  assert.equal(again.counts.created, 0);
  assert.equal(
    await db.manager.existsBy(AttendanceReview, { id: deletedReview }),
    false,
  );
  assert.equal(
    await db.manager.existsBy(AttendanceResponse, {
      roundId: demoId(`set:${options.set}:round:0`),
      participantId: demoId(`set:${options.set}:participant:0`),
    }),
    false,
  );
  assert.equal(
    await db.manager.existsBy(EventParticipant, { id: participantId }),
    false,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(Account, { id: oldAccount.id }))
      .passwordHash,
    oldAccount.passwordHash,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(Account, { id: oldAccount.id }))
      .phoneVerifiedAt,
    null,
  );
  assert.equal(outside.mock.callCount(), 0);
  outside.mock.restore();
  async function login(i: number) {
    const response = await call("auth/login", "", "POST", {
      email: demoAccounts[i]!.email,
      password: options.password,
    });
    await read(response);
    return response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
  }
  const a = await login(0),
    b = await login(1),
    empty = await login(2),
    emptyOwner = await login(4);
  const eventId = demoId(`set:${options.set}:attendance`);
  assert.equal((await call(`events/${eventId}`, a)).status, 200);
  assert.equal((await call(`events/${eventId}`, b)).status, 404);
  assert.equal((await read(await call("events", empty))).length, 0);
  assert.equal(
    (await read(await call("owner/context", emptyOwner))).restaurants.length,
    0,
  );
  const links = await demoLinks(db, "http://localhost:3000", key);
  const waitingId = demoId(`set:${options.set}:waiting`);
  const request = await db.manager.findOneByOrFail(ReservationRequest, {
    eventId: waitingId,
  });
  const target = await db.manager.findOneByOrFail(RequestTarget, {
    requestId: request.id,
  });
  const capability = links.merchantReplies.find(
    (l) => l.targetId === target.id,
  )!;
  assert(capability);
  const exchange = await read(
    await call(`merchant-replies/${target.id}/access`, "", "POST", {
      token: new URL(capability.url).hash.slice(7),
    }),
  );
  assert(
    Date.parse(exchange.accessExpiresAt) < Date.parse(exchange.linkExpiresAt),
  );
  const publicCall = (access: string, method = "GET", body?: unknown) =>
    fetch(`${url}/api/v1/merchant-replies/${target.id}`, {
      method,
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Protection": "1",
        "Content-Type": "application/json",
        "X-Merchant-Access": access,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const inquiry = await read(await publicCall(exchange.accessToken));
  assert.equal(inquiry.version, 0);
  await read(
    await publicCall(exchange.accessToken, "POST", {
      reply: {
        requestKey: randomUUID(),
        expectedVersion: 0,
        kind: "DECLINE",
        proposal: null,
        expiresAt: null,
        reason: "데모 거절",
        holdConfirmed: false,
      },
    }),
  );
  assert.equal(
    (await read(await call(`events/${waitingId}/reservation-requests`, a)))
      .request.responseCount,
    1,
  );
  const payload = Buffer.from(
    JSON.stringify({
      targetId: target.id,
      generation: 1,
      expiresAt: Date.now() - 1,
    }),
  ).toString("base64url");
  const signature = createHmac(
    "sha256",
    app.get(ConfigService).environment.authSecret,
  )
    .update(`merchant-access:${payload}`)
    .digest("base64url");
  assert.equal(
    (await read(await publicCall(`${payload}.${signature}`), 403)).code,
    "MERCHANT_ACCESS_EXPIRED",
  );
  // A real gateway cannot be reached with the same demo record, even with an ordinary 010 number.
  const gateway = app.get(MessageGateway),
    oldFlag = gateway.requiresRealRecipient;
  Object.defineProperty(gateway, "requiresRealRecipient", {
    value: true,
    configurable: true,
  });
  const send = t.mock.method(gateway, "send", async () => {
    throw new Error("real transport must be blocked");
  });
  const delivery = await db.manager.findOneByOrFail(MessageDelivery, {
    targetId: target.id,
  });
  await db.manager.update(
    MessageDelivery,
    { id: delivery.id },
    { status: "PENDING" },
  );
  await app.get(MessageDeliveryService).dispatch(delivery.id);
  assert.equal(send.mock.callCount(), 0);
  assert.equal(
    (await db.manager.findOneByOrFail(MessageDelivery, { id: delivery.id }))
      .status,
    "HELD",
  );
  send.mock.restore();
  Object.defineProperty(gateway, "requiresRealRecipient", {
    value: oldFlag,
    configurable: true,
  });
  assert.equal(
    (await read(await call("owner/inquiries", emptyOwner))).inquiries.length,
    0,
  );
  assert.equal(
    (await call(`owner/inquiries/${target.id}`, emptyOwner)).status,
    404,
  );
  // A new set adds scenarios, not accounts or copies of the catalog; prior responses stay intact.
  const restaurant = await db.manager.findOneByOrFail(Restaurant, {
    id: target.restaurantId,
  });
  const contact = await db.manager.findOneByOrFail(RestaurantContact, {
    id: target.contactId,
  });
  await db.manager.update(
    Restaurant,
    { id: restaurant.id },
    { name: "사용자 매장명" },
  );
  await db.manager.update(
    RestaurantContact,
    { id: contact.id },
    { consentNote: "사용자가 수정" },
  );
  await seedDemo(db, { ...options, set: `${options.set}-next` });
  assert.equal(
    (await db.manager.findOneByOrFail(Restaurant, { id: restaurant.id })).name,
    "사용자 매장명",
  );
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantContact, { id: contact.id }))
      .consentNote,
    "사용자가 수정",
  );
  assert.equal(
    (await db.manager.findOneByOrFail(RequestTarget, { id: target.id }))
      .replyVersion,
    1,
  );
  const nextEvent = demoId(`set:${options.set}-next:waiting`);
  await seedDemo(db, { ...options, recreate: true });
  assert(await db.manager.existsBy(EventParticipant, { id: participantId }));
  assert(await db.manager.existsBy(Event, { id: nextEvent }));
  assert.equal(
    (await db.manager.findOneByOrFail(Account, { id: oldAccount.id })).nickname,
    "내가 수정",
  );
  assert.equal(
    (await db.manager.findOneByOrFail(Restaurant, { id: restaurant.id })).name,
    "사용자 매장명",
  );
  await db.manager.update(
    Restaurant,
    { id: restaurant.id },
    { ownerAccountId: null },
  );
  await db.manager.update(
    RestaurantContact,
    { id: contact.id },
    { requestConsentAt: null },
  );
  await seedDemo(db, options);
  assert.equal(
    (await db.manager.findOneByOrFail(Restaurant, { id: restaurant.id }))
      .ownerAccountId,
    null,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantContact, { id: contact.id }))
      .requestConsentAt,
    null,
  );
  // Restore only this test's changes for other independently executable suites.
  await db.manager.update(
    Restaurant,
    { id: restaurant.id },
    { ownerAccountId: restaurant.ownerAccountId },
  );
  await db.manager.save(RestaurantContact, contact);
});
