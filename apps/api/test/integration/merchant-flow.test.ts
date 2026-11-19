import { RestaurantOperationsService } from "../../src/modules/restaurants/restaurant-operations.service.js";
import { In } from "typeorm";
import { Event } from "../../src/modules/events/entities/event.entity.js";
import { RequestTarget } from "../../src/modules/reservations/entities/request-target.entity.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";
import { catalogPolicies } from "../../src/modules/restaurants/lib/restaurant-policy.js";
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { emptyRegistration } from "../../src/modules/restaurants/types/registration.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantSpace } from "../../src/modules/restaurants/entities/restaurant-space.entity.js";
import { RestaurantMenu } from "../../src/modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantManagementService } from "../../src/modules/restaurants/restaurant-management.service.js";
import { MessageGateway } from "../../src/modules/reservations/providers/message.gateway.js";
import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import { MerchantLinksService } from "../../src/modules/reservations/merchant-links.service.js";
import { MessageDelivery } from "../../src/modules/reservations/entities/message-delivery.entity.js";
import { MerchantReplyLink } from "../../src/modules/reservations/entities/merchant-reply-link.entity.js";
import {
  MerchantReplyRevision,
  ReservationOperation,
} from "../../src/modules/reservations/entities/merchant-reply.entity.js";
import type { RegistrationData } from "../../src/modules/restaurants/types/registration.js";
const json = async <T = Record<string, unknown>>(r: Response, status = 200) => {
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b as T;
};

test("owner draft/address registration races and ownership; direct delivery, anonymous reply revisions, webhook and immutable inquiry", async (t) => {
  const secret = "test-webhook-secret-only-123456789";
  const { app, db, call, signup, url, logs } = await startResourceApplication(
    t,
    {
      SOLAPI_WEBHOOK_SECRET: secret,
      OWNER_SUPPORT_EMAIL: "owner@example.test",
    },
  );
  const owner = await signup(),
    other = await signup(),
    organizer = await signup();
  for (const jar of [owner, other])
    await json(
      await call("auth/first-setup", jar, "PATCH", { accountType: "owner" }),
    );
  const name = `등록 경쟁 ${randomUUID()}`,
    address = "서울 광진구 테스트로 100";
  async function draftFor(jar: string) {
    const d = await json<{ id: string; version: number }>(
      await call("owner/drafts", jar, "POST", {}),
      201,
    );
    const result = await json<{
      results: { id: string; baseAddress: string }[];
    }>(
      await call(`owner/drafts/${d.id}/addresses`, jar, "POST", {
        query: address,
      }),
      201,
    );
    const data: RegistrationData = {
      ...emptyRegistration(),
      name,
      addressQuery: result.results[0].baseAddress,
      detailAddress: "2층",
      phone: "01012345678",
      receiveConsent: true,
      maxCapacity: 40,
      minimumGuests: { kind: "AT_LEAST", value: 10 },
      spaces: [
        {
          label: "룸 A",
          kind: "ROOM",
          capacity: 20,
          minGuests: 10,
          minSpend: 0,
          separateFee: null,
          availability: "AVAILABLE",
          togetherSeating: "YES",
          conditions: "",
        },
      ],
    };
    const saved = await json<{ version: number }>(
      await call(`owner/drafts/${d.id}`, jar, "PUT", {
        version: d.version,
        step: 4,
        data,
        addressId: result.results[0].id,
      }),
    );
    return { ...d, version: saved.version, data };
  }
  const a = await draftFor(owner),
    b = await draftFor(other);
  assert.equal((await call(`owner/drafts/${a.id}`, other)).status, 404);
  assert.equal(
    (
      await call(`owner/drafts/${a.id}`, owner, "PUT", {
        version: a.version,
        step: 0,
        data: { ...a.data, ownerAccountId: randomUUID() },
      })
    ).status,
    400,
  );
  const forged = await call(`owner/drafts/${a.id}`, owner, "PUT", {
    version: a.version,
    step: 0,
    data: a.data,
    addressId: randomUUID(),
  });
  assert.equal(forged.status, 400);
  const submits = await Promise.all([
    call(`owner/drafts/${a.id}/submit`, owner, "POST", { version: a.version }),
    call(`owner/drafts/${b.id}/submit`, other, "POST", { version: b.version }),
  ]);
  assert.deepEqual(submits.map((r) => r.status).sort(), [201, 409]);
  const winning =
    submits[0].status === 201
      ? { jar: owner, draft: a, alien: other }
      : { jar: other, draft: b, alien: owner };
  const created = await json<{ restaurantId: string }>(
    submits.find((r) => r.status === 201)!,
    201,
  );
  assert.equal(await db.getRepository(Restaurant).countBy({ name }), 1);
  assert.equal(
    (
      await json<{ restaurantId: string }>(
        await call(
          `owner/drafts/${winning.draft.id}/submit`,
          winning.jar,
          "POST",
          { version: winning.draft.version },
        ),
        201,
      )
    ).restaurantId,
    created.restaurantId,
  );
  const r = await db
    .getRepository(Restaurant)
    .findOneByOrFail({ id: created.restaurantId });
  assert.equal(r.published, false);
  assert.equal(r.latitude, 37.5401);
  assert.equal(
    r.minimumGuests,
    null,
    "일반 홀의 문의에는 매장 공통 최소 인원을 적용하지 않는다",
  );
  assert.equal(
    (await db.getRepository(RestaurantSpace).findBy({ restaurantId: r.id }))[0]
      .kind,
    "ROOM",
  );
  assert.equal(
    (await call(`owner/restaurants/${r.id}/menus`, winning.alien)).status,
    404,
  );
  await t.test(
    "menu edits and draft conflict recovery preserve current menus, publication and untouched legacy policies",
    async () => {
      const legacy = {
        bookingPolicy: "전체 대관은 매장과 협의",
        depositPolicy: "예약금은 전화 협의",
        menuPolicy: "메뉴는 방문 전 협의",
        operatingHours: "기존 영업시간",
      };
      await db.getRepository(Restaurant).update(r.id, {
        category: "요리주점",
        policies: catalogPolicies(legacy),
      });
      type Draft = Awaited<ReturnType<RestaurantManagementService["getDraft"]>>;
      const edit = await json<Draft>(
        await call("owner/drafts", winning.jar, "POST", { restaurantId: r.id }),
        201,
      );
      const recipientBefore = await db.manager.findOneByOrFail(
        RestaurantContact,
        { restaurantId: r.id, isPrimary: true },
      );
      assert.equal(edit.data.category, "요리주점");
      edit.data.policies.minimumOrder = {
        kind: "AMOUNT",
        amount: 10000,
        quantity: null,
        unit: "",
      };
      edit.data.branchName = "유지할 입력";
      edit.data.policies.hours = {
        start: "17:00",
        end: "24:00",
        endDayOffset: 0,
      };
      const saved = await json<Draft>(
        await call(`owner/drafts/${edit.id}`, winning.jar, "PUT", {
          version: edit.version,
          data: edit.data,
          step: 4,
        }),
      );
      type Menus = Awaited<ReturnType<RestaurantManagementService["menus"]>>;
      const menuPath = `owner/restaurants/${r.id}/menus`;
      const first = await json<Menus>(await call(menuPath, winning.jar));
      await json(
        await call(menuPath, winning.jar, "PUT", {
          version: first.version,
          menu: {
            name: "테스트 메뉴",
            kind: "REGULAR",
            price: null,
            unit: "1인분",
            available: true,
            position: 0,
          },
        }),
      );
      const menus = await json<Menus>(await call(menuPath, winning.jar));
      assert(!("restaurantId" in menus.menus[0]));
      await json(
        await call(menuPath, winning.jar, "PUT", {
          version: menus.version,
          menu: { ...menus.menus[0], name: "수정된 메뉴", available: false },
        }),
      );
      assert.equal(
        (
          await call(`owner/drafts/${edit.id}/submit`, winning.jar, "POST", {
            version: saved.version,
          })
        ).status,
        409,
      );
      const reopened = await json<Draft>(
        await call("owner/drafts", winning.jar, "POST", { restaurantId: r.id }),
        201,
      );
      assert.equal(reopened.data.branchName, "유지할 입력");
      const review = await json<Draft>(
        await call(`owner/drafts/${edit.id}`, winning.jar),
      );
      assert.equal(
        (await call(`owner/drafts/${edit.id}`, winning.alien)).status,
        404,
      );
      await app.get(RestaurantOperationsService).operate({
        restaurantId: r.id,
        actor: "test-operator",
        reason: "공개 상태 경쟁 검증",
        published: true,
        dryRun: false,
      });
      assert.equal(
        (
          await call(`owner/drafts/${edit.id}`, winning.jar, "PUT", {
            version: review.version,
            restaurantVersion: review.currentRestaurant!.version,
            data: saved.data,
            step: 4,
          })
        ).status,
        409,
      );
      const latest = await json<Draft>(
        await call(`owner/drafts/${edit.id}`, winning.jar),
      );
      const resumed = await json<Draft>(
        await call(`owner/drafts/${edit.id}`, winning.jar, "PUT", {
          version: latest.version,
          restaurantVersion: latest.currentRestaurant!.version,
          data: saved.data,
          step: 4,
        }),
      );
      await json(
        await call(`owner/drafts/${edit.id}/submit`, winning.jar, "POST", {
          version: resumed.version,
        }),
        201,
      );
      const current = await db
        .getRepository(Restaurant)
        .findOneByOrFail({ id: r.id });
      assert.equal(current.branchName, "유지할 입력");
      assert.equal(current.published, true);
      const after = await json<Menus>(await call(menuPath, winning.jar));
      assert.equal(after.menus[0].id, menus.menus[0].id);
      assert.equal(after.menus[0].available, false);
      const publicView = await json<{
        bookingPolicy: string;
        depositPolicy: string;
        menuPolicy: string;
        operatingHours: string;
      }>(await call(`restaurants/${r.id}`));
      assert.equal(current.category, "요리주점");
      assert.deepEqual(
        await db.manager.findOneByOrFail(RestaurantContact, {
          id: recipientBefore.id,
        }),
        recipientBefore,
      );
      assert.ok(publicView.bookingPolicy.includes(legacy.bookingPolicy));
      assert.match(publicView.bookingPolicy, /10,000원/);
      assert.doesNotMatch(publicView.bookingPolicy, /확인 필요/);
      assert.equal(publicView.depositPolicy, legacy.depositPolicy);
      assert.equal(publicView.menuPolicy, legacy.menuPolicy);
      assert.match(publicView.operatingHours, /17:00~24:00/);
      // A catalog-only edit must also work before an operator adds the first contact.
      await db.manager.delete(RestaurantContact, recipientBefore.id);
      try {
        const withoutPhone = await json<Draft>(
          await call("owner/drafts", winning.jar, "POST", {
            restaurantId: r.id,
          }),
          201,
        );
        assert.equal(withoutPhone.data.phone, "");
        assert.equal(withoutPhone.currentRestaurant?.data.phone, "");
        const saved = await json<Draft>(
          await call(`owner/drafts/${withoutPhone.id}`, winning.jar, "PUT", {
            version: withoutPhone.version,
            data: {
              ...withoutPhone.data,
              branchName: "문의 연락처 등록 전 지점",
            },
            step: 4,
          }),
        );
        await json(
          await call(
            `owner/drafts/${withoutPhone.id}/submit`,
            winning.jar,
            "POST",
            { version: saved.version },
          ),
          201,
        );
        assert.equal(
          await db.manager.countBy(RestaurantContact, { restaurantId: r.id }),
          0,
        );
      } finally {
        await db.manager.save(RestaurantContact, recipientBefore);
      }
      // Persisted provenance is server-only: the next edit remains a valid form input.
      const again = await json<Draft>(
        await call("owner/drafts", winning.jar, "POST", { restaurantId: r.id }),
        201,
      );
      assert(!("descriptionOverrides" in again.data.policies));
      await json(
        await call(`owner/drafts/${again.id}`, winning.jar, "PUT", {
          version: again.version,
          data: again.data,
          step: 0,
        }),
      );
    },
  );
  const duplicate = await json<{ duplicate: boolean; supportEmail: string }>(
    await call(
      `owner/drafts/${winning.draft === a ? b.id : a.id}/duplicate`,
      winning.alien,
      "POST",
    ),
    201,
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.supportEmail, "owner@example.test");
  assert.doesNotMatch(JSON.stringify(duplicate), /ownerAccountId|phone/);
  await app.get(RestaurantOperationsService).operate({
    restaurantId: r.id,
    actor: "test-operator",
    reason: "가짜 fixture 검증",
    published: true,
    dryRun: false,
  });
  assert.equal(r.isDemo, true, "fake geocoding keeps source provenance");
  const unownedId = randomUUID();
  await db.getRepository(Restaurant).save({
    ...r,
    id: unownedId,
    name: "계정 없는 테스트 매장",
    ownerAccountId: null,
    registrationKey: null,
    published: true,
    verifiedAt: null,
  });
  await db.getRepository(RestaurantContact).save({
    id: randomUUID(),
    restaurantId: unownedId,
    isPrimary: true,
    name: "테스트 담당",
    phone: "01022223333",
    active: true,
    requestConsentAt: new Date(),
    consentNote: "가짜 fixture",
  });
  const provider = app.get(MessageGateway),
    sent: string[] = [];
  t.mock.method(provider, "send", async (id: string, to: string) => {
    sent.push(id);
    return to === "01022223333"
      ? {
          status: "UNKNOWN",
          provider: "solapi",
          errorCode: "TRANSPORT_UNCERTAIN",
        }
      : {
          status: "ACCEPTED",
          provider: "solapi",
          messageId: `test-${id}`,
          groupId: `group-${id}`,
        };
  });
  const event = await json<{ id: string }>(
    await call("events", organizer, "POST", { name: "문의·응답 행사" }),
    201,
  );
  const input = {
    requestKey: randomUUID(),
    mode: "DIRECT",
    expectedEventVersion: 1,
    restaurantIds: [r.id, unownedId],
    conditions: {
      startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
      expectedGuests: 20,
      region: "테스트",
      seating: "CLOSE",
      seatingImportance: "REQUIRED",
      space: "ROOM",
      spaceImportance: "REQUIRED",
    },
    contact: { name: "총무", phone: "01012345678" },
  };
  const path = `events/${event.id}/reservation-requests`;
  const inquiry = await json<{
    id: string;
    snapshot: unknown;
    targets: { id: string; restaurantId: string; deliveryStatus: string }[];
  }>(await call(path, organizer, "POST", input), 201);
  assert.equal(sent.length, 2);
  assert.deepEqual(inquiry.targets.map((x) => x.deliveryStatus).sort(), [
    "ACCEPTED",
    "UNKNOWN",
  ]);
  await json(await call(path, organizer, "POST", input), 201);
  assert.equal(sent.length, 2);
  const target = inquiry.targets.find((x) => x.restaurantId === r.id)!;
  const delivery = await db
    .getRepository(MessageDelivery)
    .findOneByOrFail({ targetId: target.id });
  const uncertain = await db.getRepository(MessageDelivery).findOneByOrFail({
    targetId: inquiry.targets.find((x) => x.restaurantId === unownedId)!.id,
  });
  await assert.rejects(
    app
      .get(MessageDeliveryService)
      .dispatch(uncertain.id, { actor: "ops", reason: "재시도 금지 확인" }),
  );
  await assert.rejects(
    app
      .get(MessageDeliveryService)
      .changeRecipient(
        uncertain.targetId,
        uncertain.contactId,
        "ops",
        "UNKNOWN 우회 금지",
        false,
      ),
  );
  assert.equal(sent.length, 2);
  const links = app.get(MerchantLinksService),
    link = await db
      .getRepository(MerchantReplyLink)
      .findOneByOrFail({ targetId: target.id });
  const raw = new URLSearchParams(new URL(links.url(link)).hash.slice(1)).get(
    "token",
  )!;
  assert(!link.encryptedToken!.includes(raw));
  assert(!JSON.stringify(delivery).includes(raw));
  const access = await json<{ accessToken: string }>(
    await call(`merchant-replies/${target.id}/access`, "", "POST", {
      token: raw,
    }),
  );
  const publicCall = (
    id: string,
    method = "GET",
    body?: unknown,
    token = access.accessToken,
  ) =>
    fetch(`${url}/api/v1/merchant-replies/${id}`, {
      method,
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Protection": "1",
        "X-Merchant-Access": token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const opened = await json<{
    version: number;
    defaults: { proposal: { expectedGuests: number }; expiresAt: string };
    snapshot: unknown;
  }>(await publicCall(target.id));
  assert.equal(opened.version, 0);
  assert.equal(
    await db
      .getRepository(MerchantReplyRevision)
      .countBy({ targetId: target.id }),
    0,
  );
  assert.doesNotMatch(
    JSON.stringify(opened),
    /01012345678|ownerAccountId|responseCount|계정 없는/,
  );
  assert.equal((await publicCall(uncertain.targetId)).status, 403);
  const reply = {
    requestKey: randomUUID(),
    expectedVersion: 0,
    kind: "AVAILABLE",
    proposal: opened.defaults.proposal,
    expiresAt: opened.defaults.expiresAt,
    reason: "",
    holdConfirmed: true,
  };
  const concurrent = await Promise.all([
    publicCall(target.id, "POST", { reply }),
    publicCall(target.id, "POST", { reply }),
  ]);
  const response = await json<{ version: number }>(concurrent[0]);
  assert.equal(response.version, 1);
  await json(concurrent[1]);
  await json(await publicCall(target.id, "POST", { reply }));
  assert.equal(
    await db
      .getRepository(MerchantReplyRevision)
      .countBy({ targetId: target.id }),
    1,
  );
  const conflict = await publicCall(target.id, "POST", {
    reply: { ...reply, requestKey: randomUUID() },
  });
  assert.equal(conflict.status, 409);
  assert.equal(
    (
      await json<{ version: number }>(
        await publicCall(target.id, "POST", {
          reply: { ...reply, expectedVersion: 1, requestKey: randomUUID() },
        }),
      )
    ).version,
    1,
  );
  const changedReply = {
    ...reply,
    kind: "CHANGE",
    proposal: { ...reply.proposal, expectedGuests: 18 },
  };
  const changedReplies = await Promise.all([
    publicCall(target.id, "POST", {
      reply: { ...changedReply, expectedVersion: 1, requestKey: randomUUID() },
    }),
    publicCall(target.id, "POST", {
      reply: { ...changedReply, expectedVersion: 1, requestKey: randomUUID() },
    }),
  ]);
  assert.deepEqual(changedReplies.map((r) => r.status).sort(), [200, 409]);
  // Replaying a lost old response must not grant the version of someone else's newer edit.
  const oldReplay = await json<{ version: number }>(
    await publicCall(target.id, "POST", { reply }),
  );
  assert.equal(oldReplay.version, 1);
  const decline = {
    ...reply,
    requestKey: randomUUID(),
    expectedVersion: 2,
    kind: "DECLINE",
    proposal: null,
    expiresAt: null,
    reason: "해당 시간은 어렵습니다",
    holdConfirmed: false,
  };
  const ownerReply = await call(
    `owner/inquiries/${target.id}`,
    winning.jar,
    "POST",
    { reply: decline },
  );
  await json(ownerReply);
  const editedDecline = await json<{ version: number }>(
    await publicCall(target.id, "POST", {
      reply: {
        ...decline,
        requestKey: randomUUID(),
        expectedVersion: 3,
        reason: "휴무일입니다",
      },
    }),
  );
  assert.equal(editedDecline.version, 4);
  assert.equal(
    (await call(`owner/inquiries/${target.id}`, winning.alien)).status,
    404,
  );
  const result = await json<{
    request: {
      id: string;
      snapshot: unknown;
      responseCount: number;
      declineCount: number;
    };
  }>(await call(path, organizer));
  assert.equal(result.request.id, inquiry.id);
  assert.deepEqual(result.request.snapshot, inquiry.snapshot);
  assert.equal(result.request.responseCount, 1);
  assert.equal(result.request.declineCount, 1);
  {
    const seedTarget = await db.manager.findOneByOrFail(RequestTarget, {
      id: target.id,
    });
    const seedRequest = await db.manager.findOneByOrFail(ReservationRequest, {
      id: inquiry.id,
    });
    const seedEvent = await db.manager.findOneByOrFail(Event, {
      id: seedRequest.eventId,
    });
    // Many same-timestamp rows expose random-UUID ordering and pagination boundary mistakes.
    const createdAt = new Date(Date.now() + 1000),
      ids: string[] = [],
      requestIds: string[] = [],
      eventIds: string[] = [];
    await db.transaction(async (m) => {
      for (let i = 0; i < 103; i++) {
        const e = {
          id: randomUUID(),
          ownerId: seedEvent.ownerId,
          groupId: null,
          version: 1,
          name: "페이지 검증",
          scheduledAt: new Date(seedRequest.snapshot.startsAt),
          createdAt,
        };
        await m.insert(Event, e);
        eventIds.push(e.id);
        const r = {
          ...seedRequest,
          id: randomUUID(),
          eventId: e.id,
          requestKey: randomUUID(),
          createdAt,
        };
        await m.insert(ReservationRequest, r);
        requestIds.push(r.id);
        const targetId = randomUUID();
        ids.push(targetId);
        await m.insert(RequestTarget, {
          ...seedTarget,
          id: targetId,
          requestId: r.id,
          replyVersion: 0,
        });
      }
    });
    try {
      let cursor: string | null = null;
      const seen: string[] = [];
      do {
        const page: {
          inquiries: { targetId: string }[];
          nextCursor: string | null;
        } = await json<{
          inquiries: { targetId: string }[];
          nextCursor: string | null;
        }>(
          await call(
            `owner/inquiries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
            winning.jar,
          ),
        );
        seen.push(
          ...page.inquiries.map((i: { targetId: string }) => i.targetId),
        );
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(new Set(seen).size, seen.length);
      assert.deepEqual(seen.slice(0, 103), ids.sort().reverse());
    } finally {
      await db.transaction(async (m) => {
        await m.delete(RequestTarget, { id: In(ids) });
        await m.delete(ReservationRequest, { id: In(requestIds) });
        await m.delete(Event, { id: In(eventIds) });
      });
    }
  }
  const report = [
    {
      messageId: delivery.providerMessageId,
      groupId: delivery.providerGroupId,
      statusCode: "4000",
      customFields: { deliveryId: delivery.id },
    },
  ];
  async function webhook(payload: unknown, valid = true) {
    const rawBody = Buffer.from(JSON.stringify(payload)),
      timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac(
      "sha256",
      createHash("sha1").update(secret).digest("hex"),
    )
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest("hex");
    return fetch(`${url}/api/v1/webhooks/solapi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Solapi-Signature": `t=${timestamp},v1=${valid ? signature : "0".repeat(64)}`,
      },
      body: rawBody,
    });
  }
  assert.equal((await webhook(report, false)).status, 403);
  for (const [code, stage] of [
    ["2230", "SUBMISSION"],
    ["3032", "DELIVERY"],
    ["3047", "DELIVERY"],
  ] as const) {
    await json(await webhook([{ ...report[0], statusCode: code }]));
    await json(await webhook([{ ...report[0], statusCode: "3000" }]));
    const failed = await db
      .getRepository(MessageDelivery)
      .findOneByOrFail({ id: delivery.id });
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.failureStage, stage);
    assert.equal(failed.errorCode, `PROVIDER_${code}`);
  }
  await json(await webhook(report));
  await json(await webhook(report));
  await json(await webhook([{ ...report[0], statusCode: "2000" }]));
  assert.equal(
    (
      await db
        .getRepository(MessageDelivery)
        .findOneByOrFail({ id: delivery.id })
    ).status,
    "DELIVERED",
  );
  // A pending dispatch can be claimed once even by two explicit operator requests.
  await db
    .getRepository(MessageDelivery)
    .update(uncertain.id, { status: "PENDING" });
  let retryCalls = 0;
  t.mock.method(provider, "send", async () => {
    retryCalls++;
    return {
      status: "ACCEPTED",
      provider: "fake",
      messageId: "fake-retry",
      groupId: "fake-retry-group",
    };
  });
  await Promise.allSettled([
    app
      .get(MessageDeliveryService)
      .dispatch(uncertain.id, { actor: "ops", reason: "경쟁 검증" }),
    app
      .get(MessageDeliveryService)
      .dispatch(uncertain.id, { actor: "ops", reason: "경쟁 검증" }),
  ]);
  assert.equal(retryCalls, 1);
  await db.getRepository(MessageDelivery).update(uncertain.id, {
    status: "PROCESSING",
    leaseUntil: new Date(Date.now() + 60000),
  });
  const lookup = t.mock.method(provider, "lookup", async () => []);
  const active = await app
    .get(MessageDeliveryService)
    .reconcile(uncertain.id, "ops", "active lease");
  assert.equal(active.status, "PROCESSING");
  assert.equal(active.queryAttempted, false);
  assert.equal(lookup.mock.callCount(), 0);
  await db
    .getRepository(MessageDelivery)
    .update(uncertain.id, { leaseUntil: new Date(Date.now() - 1) });
  const operationCount = await db.manager.count(ReservationOperation);
  await app.get(MessageDeliveryService).dispatch(uncertain.id);
  const filtered = await app
    .get(MessageDeliveryService)
    .listForOperations({ status: "PROCESSING", deliveryId: uncertain.id });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].leaseExpired, true);
  await app
    .get(MessageDeliveryService)
    .reconcile(uncertain.id, "ops", "dry-run", true);
  assert.equal(
    (await db.manager.findOneByOrFail(MessageDelivery, { id: uncertain.id }))
      .status,
    "PROCESSING",
  );
  assert.equal(await db.manager.count(ReservationOperation), operationCount);
  assert.equal(lookup.mock.callCount(), 0);
  const reconciled = await app
    .get(MessageDeliveryService)
    .reconcile(uncertain.id, "ops", "expired processing reconciliation", false);
  assert.equal(reconciled.leaseChanged, true);
  assert.equal(reconciled.queryAttempted, true);
  assert.equal(reconciled.unresolved, true);
  assert.equal(lookup.mock.callCount(), 1);
  assert.equal(
    await db.manager.count(ReservationOperation, {
      where: { targetId: uncertain.targetId, action: "DELIVERY_LEASE_EXPIRED" },
    }),
    1,
  );
  assert.equal(
    (
      await db
        .getRepository(MessageDelivery)
        .findOneByOrFail({ id: uncertain.id })
    ).status,
    "UNKNOWN",
  );
  assert.equal(retryCalls, 1);
  const deliveryService = app.get(MessageDeliveryService);
  const beforeRotation = await db
    .getRepository(MerchantReplyLink)
    .findOneByOrFail({ targetId: target.id });
  await deliveryService.regenerateLink(
    target.id,
    "test-operator",
    "dry-run",
    true,
  );
  assert.equal(
    (
      await db
        .getRepository(MerchantReplyLink)
        .findOneByOrFail({ targetId: target.id })
    ).digest,
    beforeRotation.digest,
  );
  assert.equal(retryCalls, 1);
  await assert.rejects(
    deliveryService.regenerateLink(
      uncertain.targetId,
      "ops",
      "불명 발송 우회 금지",
      false,
    ),
    { code: "DELIVERY_RETRY_BLOCKED" },
  );
  // Reconciliation can recover provider evidence, but never submits another message.
  await db.manager.update(
    MessageDelivery,
    { id: uncertain.id },
    { provider: "solapi" },
  );
  lookup.mock.restore();
  t.mock.method(provider, "lookup", async () => [
    {
      deliveryId: uncertain.id,
      messageId: "fake-retry",
      groupId: "fake-retry-group",
      status: "DELIVERED" as const,
      provider: "solapi" as const,
      statusCode: "4000",
    },
  ]);
  const recovered = await deliveryService.reconcile(
    uncertain.id,
    "ops",
    "공급자 결과 확인",
  );
  assert.equal(recovered.status, "DELIVERED");
  assert.equal(recovered.unresolved, false);
  assert.equal(retryCalls, 1);
  let sentLink = "";
  t.mock.method(
    provider,
    "send",
    async (id: string, _to: string, text: string) => {
      // The new link/delivery must already be visible outside the creation transaction.
      assert(
        await db
          .getRepository(MessageDelivery)
          .existsBy({ id, status: "PROCESSING" }),
      );
      sentLink = text.match(/https?:\/\/\S+/)![0];
      return {
        status: "ACCEPTED",
        provider: "fake",
        messageId: `regenerated-${id}`,
      };
    },
  );
  const rotation = await deliveryService.regenerateLink(
    target.id,
    "test-operator",
    "링크 재발급",
    false,
  );
  assert.equal("status" in rotation && rotation.status, "ACCEPTED");
  assert(rotation.deliveryId);
  assert.doesNotMatch(JSON.stringify(rotation), /#token=/);
  const rotatedLink = await db
    .getRepository(MerchantReplyLink)
    .findOneByOrFail({ targetId: target.id });
  assert.equal(sentLink, links.url(rotatedLink));
  await assert.rejects(
    deliveryService.dispatch(rotation.deliveryId, {
      actor: "ops",
      reason: "접수된 문자 중복 재시도",
    }),
    { code: "DELIVERY_RETRY_BLOCKED" },
  );
  // A second explicit rotation keeps both generation records and does not reuse the original delivery.
  const rotation2 = await deliveryService.regenerateLink(
    target.id,
    "test-operator",
    "두 번째 명시적 재발급",
    false,
  );
  assert.equal(rotation2.generation, rotation.generation + 1);
  assert.notEqual(rotation2.deliveryId, rotation.deliveryId);
  assert.equal(
    await db
      .getRepository(MessageDelivery)
      .countBy({ targetId: target.id, purpose: "LINK_REGENERATED" }),
    2,
  );
  assert.equal((await publicCall(target.id)).status, 403);
  assert.equal(
    (
      await call(`merchant-replies/${target.id}/access`, "", "POST", {
        token: raw,
      })
    ).status,
    403,
  );
  const regenerated = await db
    .getRepository(MerchantReplyLink)
    .findOneByOrFail({ targetId: target.id });
  const newRaw = new URLSearchParams(
    new URL(links.url(regenerated)).hash.slice(1),
  ).get("token")!;
  const nextAccess = await json<{ accessToken: string }>(
    await call(`merchant-replies/${target.id}/access`, "", "POST", {
      token: newRaw,
    }),
  );
  await db
    .getRepository(MerchantReplyLink)
    .update(target.id, { expiresAt: new Date(Date.now() - 1) });
  assert.equal(
    (
      await publicCall(
        target.id,
        "POST",
        { reply: { ...decline, expectedVersion: 3, requestKey: randomUUID() } },
        nextAccess.accessToken,
      )
    ).status,
    403,
  );
  await db
    .getRepository(MerchantReplyLink)
    .update(target.id, { expiresAt: regenerated.expiresAt });
  await db
    .getRepository(RestaurantContact)
    .update({ restaurantId: r.id }, { active: false });
  assert.equal(
    (await publicCall(target.id, "GET", undefined, nextAccess.accessToken))
      .status,
    403,
  );
  // Explicit handover uses a new contact and link, retaining every original snapshot.
  const newContact = randomUUID();
  await db.getRepository(RestaurantContact).save({
    id: newContact,
    restaurantId: r.id,
    name: "새 담당자 fixture",
    phone: "01033334444",
    active: true,
    requestConsentAt: null,
    consentNote: "test only",
  });
  const deliveries = app.get(MessageDeliveryService);
  await assert.rejects(
    deliveries.changeRecipient(
      target.id,
      newContact,
      "ops",
      "담당자 확인",
      false,
    ),
  );
  await db.getRepository(RestaurantContact).delete(newContact);
  const confirmedContact = {
    id: newContact,
    name: "운영 확인 담당자",
    phone: "01033334444",
    requestConsentAt: new Date().toISOString(),
    consentNote: "test only, operator confirmation",
  };
  const operations = app.get(RestaurantOperationsService);
  await operations.recordContact(
    r.id,
    confirmedContact,
    "ops",
    "확인한 연락처 등록",
    false,
  );
  await operations.recordContact(
    r.id,
    confirmedContact,
    "ops",
    "동일 실행 재시도",
    false,
  );
  assert.equal(
    await db.getRepository(RestaurantContact).countBy({ id: newContact }),
    1,
  );
  const contacts = db.getRepository(RestaurantContact);
  assert.equal(
    (await contacts.findOneByOrFail({ id: newContact })).isPrimary,
    true,
  );
  const alternative = {
    ...confirmedContact,
    id: randomUUID(),
    phone: "01000009999",
  };
  await operations.recordContact(
    r.id,
    alternative,
    "ops",
    "추가 연락처 등록",
    false,
  );
  assert.equal(
    (await contacts.findOneByOrFail({ id: alternative.id })).isPrimary,
    false,
  );
  await operations.recordContact(
    r.id,
    { ...alternative, primary: true },
    "ops",
    "대표 수신자 변경",
    false,
  );
  assert.equal(
    (await contacts.findOneByOrFail({ restaurantId: r.id, isPrimary: true }))
      .id,
    alternative.id,
  );
  assert.equal(
    (await contacts.findOneByOrFail({ id: newContact })).active,
    true,
  );
  // Reproduce a server stop before dispatch: the old recipient still has a queued message.
  await db
    .getRepository(MessageDelivery)
    .update(rotation2.deliveryId!, { status: "PENDING" });
  const handover = await deliveries.changeRecipient(
    target.id,
    newContact,
    "ops",
    "담당자 확인",
    false,
  );
  assert.equal(
    (
      await db
        .getRepository(MessageDelivery)
        .findOneByOrFail({ id: rotation2.deliveryId! })
    ).status,
    "CANCELLED",
  );
  const repeatedHandover = await deliveries.changeRecipient(
    target.id,
    newContact,
    "ops",
    "재시도",
    false,
  );
  assert.equal(handover.deliveryId, repeatedHandover.deliveryId);
  assert.equal(
    sent.filter((id) => id === delivery.id || id === uncertain.id).length,
    2,
  ); // Other sends are distinct organizer notifications.
  await json(await webhook(report));
  const pending = await json<{
    request: { targets: { id: string; deliveryStatus: string }[] };
  }>(await call(path, organizer));
  assert.equal(
    pending.request.targets.find((t) => t.id === target.id)!.deliveryStatus,
    "PENDING",
  );
  t.mock.method(
    provider,
    "send",
    async (id: string, _to: string, _text: string, attempt: number) => {
      await json(
        await webhook([
          {
            messageId: `handover-${id}`,
            groupId: `handover-group-${id}`,
            statusCode: "4000",
            customFields: { deliveryId: id, deliveryAttempt: String(attempt) },
          },
        ]),
      );
      return {
        status: "ACCEPTED",
        provider: "solapi",
        messageId: `handover-${id}`,
        groupId: `handover-group-${id}`,
      };
    },
  );
  await deliveries.dispatch(handover.deliveryId!, {
    actor: "ops",
    reason: "새 수신자 발송 확인",
  });
  assert.equal(
    (
      await db
        .getRepository(MessageDelivery)
        .findOneByOrFail({ id: handover.deliveryId! })
    ).status,
    "DELIVERED",
  );
  await deliveries.regenerateLink(target.id, "ops", "handover completed", true);

  const original = await db.query(
    "SELECT contact_id, contact_phone FROM reservation_request_targets WHERE id = $1",
    [target.id],
  );
  assert.equal(original[0].contact_id, delivery.contactId);
  assert.equal(original[0].contact_phone, delivery.phoneSnapshot);
  assert.equal(
    (await publicCall(target.id, "GET", undefined, nextAccess.accessToken))
      .status,
    403,
  );
  const activeLink = await db
    .getRepository(MerchantReplyLink)
    .findOneByOrFail({ targetId: target.id });
  const handoverRaw = new URLSearchParams(
    new URL(links.url(activeLink)).hash.slice(1),
  ).get("token")!;
  const handoverAccess = await json<{ accessToken: string }>(
    await call(`merchant-replies/${target.id}/access`, "", "POST", {
      token: handoverRaw,
    }),
  );
  await json(
    await publicCall(target.id, "GET", undefined, handoverAccess.accessToken),
  );
  assert(!JSON.stringify(logs).includes(raw));
  assert(!JSON.stringify(logs).includes(access.accessToken));
  const targetIds = inquiry.targets.map((t) => t.id);
  for (const table of [
    "message_delivery_reports",
    "message_deliveries",
    "merchant_reply_revisions",
    "merchant_reply_links",
    "reservation_operations",
  ]) {
    if (table === "message_delivery_reports")
      await db.query(
        "DELETE FROM message_delivery_reports WHERE delivery_id IN (SELECT id FROM message_deliveries WHERE target_id = ANY($1::uuid[]))",
        [targetIds],
      );
    else
      await db.query(`DELETE FROM ${table} WHERE target_id = ANY($1::uuid[])`, [
        targetIds,
      ]);
  }
  await db.query(
    "DELETE FROM reservation_request_targets WHERE request_id = $1",
    [inquiry.id],
  );
  await db.query("DELETE FROM reservation_requests WHERE id = $1", [
    inquiry.id,
  ]);
  await db.query(
    "DELETE FROM restaurant_drafts WHERE id = ANY($1::uuid[]) OR restaurant_id = ANY($2::uuid[])",
    [
      [a.id, b.id],
      [r.id, unownedId],
    ],
  );
  for (const table of [
    "restaurant_operations",
    "restaurant_contacts",
    "restaurant_spaces",
  ])
    await db.query(
      `DELETE FROM ${table} WHERE restaurant_id = ANY($1::uuid[])`,
      [[r.id, unownedId]],
    );
  await db.getRepository(RestaurantMenu).delete({ restaurantId: r.id });
  await db.getRepository(Restaurant).delete(r.id);
  await db.getRepository(Restaurant).delete(unownedId);
});
