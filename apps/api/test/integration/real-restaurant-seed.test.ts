import { MessageDeliveryService } from "../../src/modules/reservations/message-delivery.service.js";
import { MessageDelivery } from "../../src/modules/reservations/entities/message-delivery.entity.js";
import { MerchantReplyLink } from "../../src/modules/reservations/entities/merchant-reply-link.entity.js";
import { RestaurantOperationsService } from "../../src/modules/restaurants/restaurant-operations.service.js";
import { RestaurantOperation } from "../../src/modules/restaurants/entities/restaurant-operation.entity.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { In, IsNull } from "typeorm";
import { startResourceApplication } from "../support/resource-application.js";
import {
  restaurantSeedId,
  seedRestaurants,
} from "../../src/database/seeds/restaurants.seed.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantSpace } from "../../src/modules/restaurants/entities/restaurant-space.entity.js";
import { RestaurantMenu } from "../../src/modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantContactSeedReceipt } from "../../src/modules/restaurants/entities/restaurant-contact-seed-receipt.entity.js";

import { RequestTarget } from "../../src/modules/reservations/entities/request-target.entity.js";
import { ReservationRequest } from "../../src/modules/reservations/entities/reservation-request.entity.js";

import publicFixture from "../../src/database/seeds/data/restaurants.json" with { type: "json" };

type Fixture = {
  restaurants: {
    key: string;
    name: string;
    maxCapacity: number | null;
    spaces: { key: string; kind: string; capacity: number | null }[];
    menus: { key: string; price: number | null }[];
  }[];
};

test("real restaurant seed preserves surveyed conditions, unknown prices, private contacts and operator edits atomically", async (t) => {
  const { app, db, call, signup, logs } = await startResourceApplication(t);
  t.mock.method(
    app.get(MessageDeliveryService),
    "dispatchRequest",
    async () => undefined,
  );
  let requestId: string | undefined;
  const fixture = structuredClone(publicFixture) as Fixture;
  const keys = fixture.restaurants.map((restaurant) => restaurant.key);
  const ids = keys.map((key) => restaurantSeedId("restaurant", key));
  const invalidKeys = ["seed-invalid-first", "seed-invalid-second"];
  const rollbackKeys = ["seed-rollback-first", "seed-rollback-second"];
  const cleanupIds = [...keys, ...invalidKeys, ...rollbackKeys].map((key) =>
    restaurantSeedId("restaurant", key),
  );
  const restaurants = db.getRepository(Restaurant);
  const spaces = db.getRepository(RestaurantSpace);
  const menus = db.getRepository(RestaurantMenu);
  const contacts = db.getRepository(RestaurantContact);
  const privateFixture = {
    contacts: keys.map((restaurantKey, index) => ({
      restaurantKey,
      name: `비공개 테스트 담당자 ${index}`,
      phone: `0109999000${index}`,
      requestConsentAt: "2026-11-18T00:00:00Z",
      consentNote: "자동 테스트용 동의 기록. 실제 연락 대상이 아닙니다.",
    })),
  };

  try {
    const preview = await seedRestaurants(db, fixture, undefined, {
      dryRun: true,
    });
    assert.equal(preview.restaurants.created, fixture.restaurants.length);
    assert.equal(await restaurants.countBy({ id: In(ids) }), 0);
    assert.equal(await spaces.countBy({ restaurantId: In(ids) }), 0);
    assert.equal(await menus.countBy({ restaurantId: In(ids) }), 0);
    const seeded = await seedRestaurants(db, fixture);
    assert.deepEqual(seeded, preview);
    const preserved = await seedRestaurants(db, fixture);
    assert.equal(preserved.restaurants.created, 0);
    assert.equal(preserved.menus.created, 0);
    assert.equal(preserved.spaces.created, 0);
    assert.equal(await restaurants.countBy({ id: In(ids) }), 4);
    const realAddress = await restaurants.findOneByOrFail({ id: ids[0]! });
    await assert.rejects(
      app.get(RestaurantOperationsService).normalizeAddress({
        restaurantId: realAddress.id,
        actor: "test",
        reason: "fake must not overwrite real address",
        query: "가상 검색 결과",
        baseAddress: "가상 검색 결과",
        detailAddress: "",
        version: realAddress.version,
        dryRun: false,
      }),
      (error) =>
        (error as { code?: string }).code === "ADDRESS_SELECTION_REQUIRED",
    );
    assert.equal(
      (await restaurants.findOneByOrFail({ id: realAddress.id })).address,
      realAddress.address,
    );

    assert.equal(await spaces.countBy({ restaurantId: In(ids) }), 11);
    assert.equal(await menus.countBy({ restaurantId: In(ids) }), 146);
    assert.equal(
      await menus.countBy({ restaurantId: In(ids), price: IsNull() }),
      30,
    );
    assert.equal(await contacts.countBy({ restaurantId: In(ids) }), 0);
    const initialCatalog = (await (await call("restaurants")).json()) as {
      items: { id: string; inquiryAvailable: boolean }[];
    };
    assert(
      initialCatalog.items
        .filter((restaurant) => ids.includes(restaurant.id))
        .every((restaurant) => !restaurant.inquiryAvailable),
    );

    for (const [size, count] of [
      [20, 4],
      [80, 4],
      [81, 3],
      [121, 1],
      [191, 0],
    ]) {
      const list = (await (
        await call("restaurants?expectedGuests=" + size)
      ).json()) as { items: { id: string }[] };
      assert.equal(list.items.filter((r) => ids.includes(r.id)).length, count);
      const map = (await (
        await call("restaurants/map?expectedGuests=" + size)
      ).json()) as { id: string }[];
      assert.equal(map.filter((r) => ids.includes(r.id)).length, count);
    }
    const gaemijipId = restaurantSeedId("restaurant", "gaemijiptu");
    assert.equal(
      (await restaurants.findOneByOrFail({ id: gaemijipId })).maxCapacity,
      80,
    );
    assert.equal(
      (
        await spaces.findOneByOrFail({
          restaurantId: gaemijipId,
          kind: "WHOLE",
        })
      ).minGuests,
      70,
    );
    assert.equal(
      (
        await spaces.findOneByOrFail({
          restaurantId: restaurantSeedId("restaurant", "otaesik-sejong"),
          kind: "ROOM",
        })
      ).capacity,
      20,
    );

    await Promise.all([
      seedRestaurants(db, fixture, privateFixture),
      seedRestaurants(db, fixture, privateFixture),
    ]);
    assert.equal(await restaurants.countBy({ id: In(ids) }), 4);
    assert.equal(await spaces.countBy({ restaurantId: In(ids) }), 11);
    assert.equal(await menus.countBy({ restaurantId: In(ids) }), 146);
    assert.equal(await contacts.countBy({ restaurantId: In(ids) }), 4);
    const noInquiryContactId = restaurantSeedId("contact", keys[1]!);
    assert.equal(
      await db
        .getRepository(RequestTarget)
        .existsBy({ contactId: noInquiryContactId }),
      false,
    );
    await contacts.delete({ id: noInquiryContactId });
    await Promise.all([
      seedRestaurants(db, fixture, privateFixture),
      seedRestaurants(db, fixture, privateFixture),
    ]);
    assert.equal(await contacts.existsBy({ id: noInquiryContactId }), false);
    assert.equal(
      (await (await call(`restaurants/${ids[1]}`)).json()).inquiryAvailable,
      false,
    );

    for (const [region, expectedKeys] of [
      ["", keys],
      ["세종대 · 어린이대공원", ["gaemijiptu", "bakmulje", "otaesik-sejong"]],
      [
        "  세종대 · · 어린이대공원 · 세종대  ",
        ["gaemijiptu", "bakmulje", "otaesik-sejong"],
      ],
      ["건대 후문", ["gaemijiptu", "bakmulje"]],
      ["광나루로 379", ["otaesik-sejong"]],
      ["%", []],
      ["_", []],
    ] as [string, string[]][]) {
      const result = (await (
        await call(`restaurants?region=${encodeURIComponent(region)}`)
      ).json()) as { items: { id: string }[] };
      assert.deepEqual(
        result.items
          .filter((r) => ids.includes(r.id))
          .map((r) => r.id)
          .sort(),
        expectedKeys.map((key) => restaurantSeedId("restaurant", key)).sort(),
      );
    }
    const catalog = await (await call("restaurants")).json();
    const detail = await (await call(`restaurants/${gaemijipId}`)).json();
    const publicJson = JSON.stringify({ catalog, detail });
    assert.doesNotMatch(publicJson, /비공개 테스트 담당자|0109999000\d/);
    assert.doesNotMatch(publicJson, /consentNote|requestConsentAt|sourceNotes/);

    // A real HTTP inquiry retains both its foreign keys and immutable contact
    // snapshot when operators edit the catalog and the seed runs again.
    const jar = await signup();
    const eventResponse = await call("events", jar, "POST", {
      name: "시드 참조 보존",
    });
    assert.equal(eventResponse.status, 201);
    const event = (await eventResponse.json()) as { id: string };
    const inquiryPath = `events/${event.id}/reservation-requests`;
    const inquiryResponse = await call(inquiryPath, jar, "POST", {
      requestKey: randomUUID(),
      mode: "DIRECT",
      expectedEventVersion: 1,
      restaurantIds: [ids[0]],
      conditions: {
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        expectedGuests: 75,
        region: "건대입구",
        seating: "ANY",
        space: "WHOLE",
        spaceImportance: "REQUIRED",
      },
      contact: { name: "테스트 총무", phone: "01000000000" },
    });
    assert.equal(inquiryResponse.status, 201);
    const inquiry = (await inquiryResponse.json()) as { id: string };
    requestId = inquiry.id;
    const savedTargets = await db
      .getRepository(RequestTarget)
      .findBy({ requestId });
    assert.equal(savedTargets.length, 1);
    assert.equal(
      savedTargets[0]!.contactId,
      restaurantSeedId("contact", keys[0]!),
    );
    assert.equal(savedTargets[0]!.deliveryStatus, "PENDING");
    assert.equal(savedTargets[0]!.isDemo, false);

    const ownerJar = await signup();
    await call("auth/first-setup", ownerJar, "PATCH", { accountType: "owner" });
    const ownerAccount = await (await call("auth/me", ownerJar)).json();
    await app.get(RestaurantOperationsService).operate({
      restaurantId: ids[0]!,
      accountId: ownerAccount.id,
      actor: "seed-test",
      reason: "소유권 보존 검증",
      dryRun: false,
    });
    const first = fixture.restaurants[0]!;
    const menuId = restaurantSeedId(
      "menu",
      `${first.key}/${first.menus[0]!.key}`,
    );
    const spaceId = restaurantSeedId(
      "space",
      `${first.key}/${first.spaces[0]!.key}`,
    );
    const contactId = restaurantSeedId("contact", first.key);
    await restaurants.update(
      { id: ids[0]! },
      {
        name: "운영자가 수정한 상호",
        published: false,
        spacePhotos: [
          {
            path: "/images/operator-photo.png",
            description: "운영자 사진",
            position: 1,
          },
        ],
      },
    );
    await menus.update({ id: menuId }, { price: 12345, available: false });
    await spaces.update({ id: spaceId }, { capacity: 77 });
    await contacts.update(
      { id: contactId },
      { active: false, requestConsentAt: null },
    );
    await seedRestaurants(db, fixture, privateFixture);
    assert.equal(
      (await restaurants.findOneByOrFail({ id: ids[0]! })).ownerAccountId,
      ownerAccount.id,
    );
    assert.equal(
      (await restaurants.findOneByOrFail({ id: ids[0]! })).name,
      "운영자가 수정한 상호",
    );
    assert.equal(
      (await restaurants.findOneByOrFail({ id: ids[0]! })).published,
      false,
    );
    assert.deepEqual(
      (await restaurants.findOneByOrFail({ id: ids[0]! })).spacePhotos,
      [
        {
          path: "/images/operator-photo.png",
          description: "운영자 사진",
          position: 1,
        },
      ],
    );
    assert.equal((await menus.findOneByOrFail({ id: menuId })).price, 12345);
    assert.equal(
      (await menus.findOneByOrFail({ id: menuId })).available,
      false,
    );
    assert.equal((await spaces.findOneByOrFail({ id: spaceId })).capacity, 77);
    assert.equal(
      (await contacts.findOneByOrFail({ id: contactId })).active,
      false,
    );
    assert.equal(
      (await contacts.findOneByOrFail({ id: contactId })).requestConsentAt,
      null,
    );

    assert.deepEqual(
      await db.getRepository(RequestTarget).findBy({ requestId }),
      savedTargets,
      "reseeding must preserve inquiry references and private contact snapshots",
    );
    assert.deepEqual(
      (await (await call(inquiryPath, jar)).json()).request,
      inquiry,
    );
    assert.doesNotMatch(
      JSON.stringify(logs),
      /0109999000\d|비공개 테스트 담당자/,
    );

    await contacts.delete({ id: contactId });
    await seedRestaurants(db, fixture, privateFixture);
    assert.equal(await contacts.existsBy({ id: contactId }), false);
    const pending = await app
      .get(MessageDeliveryService)
      .listForOperations({ status: "PENDING" });
    assert(
      !pending.some(
        (target) =>
          target.request_id === requestId && !target.holdReasons.length,
      ),
    );
    assert(
      pending
        .find((target) => target.request_id === requestId)
        ?.holdReasons.includes("CONTACT_DELETED"),
    );
    assert.deepEqual(
      await db.getRepository(RequestTarget).findBy({ requestId }),
      savedTargets,
    );

    const invalid = structuredClone(fixture);
    invalid.restaurants = invalid.restaurants.slice(0, 2);
    invalid.restaurants.forEach((restaurant, index) => {
      restaurant.key = invalidKeys[index]!;
    });
    invalid.restaurants[1]!.name = "";
    await assert.rejects(seedRestaurants(db, invalid));
    const invalidIds = invalidKeys.map((key) =>
      restaurantSeedId("restaurant", key),
    );
    assert.equal(await restaurants.countBy({ id: In(invalidIds) }), 0);

    // A different fixed key must not silently claim an existing restaurant.
    // Reject the second collision and roll back the first new restaurant too.
    const rollback = structuredClone(fixture);
    rollback.restaurants = rollback.restaurants.slice(0, 2);
    rollback.restaurants.forEach((restaurant, index) => {
      restaurant.key = rollbackKeys[index]!;
    });
    rollback.restaurants[0]!.name = "운영 시드 충돌 테스트 첫 매장";
    await assert.rejects(seedRestaurants(db, rollback));
    const rollbackIds = rollbackKeys.map((key) =>
      restaurantSeedId("restaurant", key),
    );
    assert.equal(await restaurants.countBy({ id: In(rollbackIds) }), 0);
    assert.equal(await menus.countBy({ restaurantId: In(rollbackIds) }), 0);
    assert.equal(await spaces.countBy({ restaurantId: In(rollbackIds) }), 0);
  } finally {
    // Other suites share the isolated test DB and expect their own catalog.
    if (requestId) {
      const targetIds = (
        await db.getRepository(RequestTarget).findBy({ requestId })
      ).map((t) => t.id);
      await db
        .getRepository(MessageDelivery)
        .delete({ targetId: In(targetIds) });
      await db
        .getRepository(MerchantReplyLink)
        .delete({ targetId: In(targetIds) });
      await db.getRepository(RequestTarget).delete({ requestId });
      await db.getRepository(ReservationRequest).delete({ id: requestId });
    }
    await contacts.delete({ restaurantId: In(cleanupIds) });
    await db.getRepository(RestaurantContactSeedReceipt).delete({
      contactId: In(keys.map((key) => restaurantSeedId("contact", key))),
    });
    await menus.delete({ restaurantId: In(cleanupIds) });
    await spaces.delete({ restaurantId: In(cleanupIds) });
    await db
      .getRepository(RestaurantOperation)
      .delete({ restaurantId: In(cleanupIds) });
    await restaurants.delete({ id: In(cleanupIds) });
  }
});
