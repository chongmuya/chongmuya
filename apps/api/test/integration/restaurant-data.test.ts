import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DataSource } from "typeorm";
import { databaseOptions } from "../../src/database/database-options.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { RestaurantDataService } from "../../src/modules/restaurants/restaurant-data.service.js";
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantSpace } from "../../src/modules/restaurants/entities/restaurant-space.entity.js";
import { RestaurantMenu } from "../../src/modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantOperation } from "../../src/modules/restaurants/entities/restaurant-operation.entity.js";
import { restaurantSeedId } from "../../src/modules/restaurants/lib/restaurant-data-id.js";
import { restaurantDataFixture } from "../support/restaurant-data.js";

const options = { actor: "data-test", reason: "synthetic fixture" };
test("restaurant data import/update preserves identities, consent, partial fields and atomicity without booting HTTP or providers", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const db = new DataSource(
    databaseOptions({ databaseUrl: process.env.TEST_DATABASE_URL }),
  );
  await db.initialize();
  t.after(() => db.destroy());
  await db.runMigrations();
  const service = new RestaurantDataService(new DatabaseService(db));
  const fixture = restaurantDataFixture(`data-${randomUUID()}`),
    first = fixture.restaurants[0]!;
  const id = restaurantSeedId("restaurant", first.key),
    menuId = restaurantSeedId("menu", `${first.key}/daily-meal`);
  const read = () => db.manager.findOneByOrFail(Restaurant, { id });
  const patch = async (changes: unknown, execute = true, version?: number) =>
    service.update(
      {
        restaurants: [
          {
            key: first.key,
            expectedVersion: version ?? (await read()).version,
            changes,
          },
        ],
      },
      { ...options, execute },
    );
  const count = await db.manager.count(Restaurant);
  const preview = await service.import(fixture, options);
  assert.equal(preview.created, 4);
  assert.equal(await db.manager.count(Restaurant), count);
  await service.import(fixture, { ...options, execute: true });
  assert.equal(await db.manager.count(Restaurant), count + 4);
  assert.equal((await read()).isDemo, false);
  assert.equal(
    (await read()).policies.sourceDescriptions.depositPolicy,
    first.depositPolicy,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantMenu, { id: menuId })).position,
    0,
  );
  assert.equal(
    (
      await db.manager.findOneByOrFail(RestaurantMenu, {
        id: restaurantSeedId(
          "menu",
          `${fixture.restaurants[2]!.key}/daily-meal`,
        ),
      })
    ).price,
    null,
  );
  const contactId = restaurantSeedId("contact", first.key);
  await db.manager.update(RestaurantContact, contactId, {
    name: "보존할 담당자",
  });
  await patch({ contact: { ...first.contact, phone: "010-0000-9000" } });
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantContact, { id: contactId }))
      .name,
    "보존할 담당자",
  );
  const before = await read();
  const changed = { name: `부분 수정 ${first.key}`, facilities: null };
  await patch(changed, false);
  assert.deepEqual(await read(), before);
  await patch(changed, true, before.version);
  await assert.rejects(patch(changed, true, before.version), {
    code: "RESTAURANT_VERSION_CONFLICT",
  });
  assert.equal((await read()).address, before.address);
  assert.deepEqual((await read()).policies, before.policies);
  await service.update(
    {
      restaurants: [
        {
          id,
          expectedVersion: (await read()).version,
          changes: {
            menus: [
              {
                action: "update",
                key: `${first.key}/daily-meal`,
                changes: { available: false },
              },
            ],
          },
        },
      ],
    },
    { ...options, execute: true },
  );
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantMenu, { id: menuId }))
      .available,
    false,
  );
  await patch({
    menus: [{ action: "update", key: "daily-meal", changes: { price: null } }],
  });
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantMenu, { id: menuId })).price,
    null,
  );
  const otherMenu = restaurantSeedId(
    "menu",
    `${fixture.restaurants[1]!.key}/daily-meal`,
  );
  await assert.rejects(
    patch({
      menus: [
        { action: "update", id: otherMenu, changes: { available: false } },
      ],
    }),
    { code: "RESOURCE_TARGET_CONFLICT" },
  );
  await patch({
    menus: [
      {
        action: "add",
        key: "extra",
        data: {
          name: "추가 가상 메뉴",
          kind: "REGULAR",
          price: 0,
          unit: "개",
          available: true,
          position: 1,
        },
      },
    ],
  });
  assert.equal(
    await db.manager.countBy(RestaurantMenu, { restaurantId: id }),
    2,
  );
  await patch({
    menus: [{ action: "update", key: "extra", changes: { available: false } }],
  });
  assert.equal(
    await db.manager.countBy(RestaurantMenu, { restaurantId: id }),
    2,
  );
  await patch({ policies: { deposit: { kind: "FIXED", amount: 5000 } } });
  assert(
    (await read()).policies.descriptionOverrides.includes("depositPolicy"),
  );
  await assert.rejects(
    patch({ depositPolicy: "ignored text must not be accepted" }),
    { code: "POLICY_DESCRIPTION_OVERRIDDEN" },
  );
  const weeklyHours = {
    days: Array.from({ length: 7 }, () => ({
      kind: "CLOSED",
      start: "09:00",
      end: "18:00",
      endDayOffset: 0,
    })),
    note: "가상 요일 설정",
  };
  await patch({ policies: { weeklyHours } });
  assert.deepEqual((await read()).policies.weeklyHours, weeklyHours);
  await patch({ facilities: "별도 표시 변경" });
  assert.deepEqual((await read()).policies.weeklyHours, weeklyHours);
  await patch({ policies: { weeklyHours: null } });
  assert.equal((await read()).policies.weeklyHours, undefined);
  assert.equal((await read()).policies.deposit.amount, 5000);
  await patch({
    contact: { phone: first.contact.phone, requestConsentAt: null },
  });
  await assert.rejects(patch({ contact: first.contact }));
  const withdrawn = await db.manager.findOneByOrFail(RestaurantContact, {
    id: contactId,
  });
  assert.equal(withdrawn.active, false);
  assert.equal(withdrawn.isPrimary, false);
  await db.manager.delete(RestaurantMenu, menuId);
  const spaceId = restaurantSeedId("space", `${first.key}/floor`);
  await db.manager.delete(RestaurantSpace, spaceId);
  const fingerprint = await read();
  assert.equal(
    (await service.import(fixture, { ...options, execute: true })).skipped,
    4,
  );
  assert.equal(
    await db.manager.existsBy(RestaurantMenu, { id: menuId }),
    false,
  );
  assert.equal(
    await db.manager.existsBy(RestaurantSpace, { id: spaceId }),
    false,
  );
  assert.equal(
    (await db.manager.findOneByOrFail(RestaurantContact, { id: contactId }))
      .active,
    false,
  );
  assert.deepEqual(await read(), fingerprint);
  await db.manager.delete(RestaurantContact, contactId);
  await service.import(fixture, { ...options, execute: true });
  assert.equal(
    await db.manager.existsBy(RestaurantContact, { id: contactId }),
    false,
  );
  await patch({ contact: { phone: "01000009999" } });
  const added = await db.manager.findOneByOrFail(RestaurantContact, {
    restaurantId: id,
    phone: "01000009999",
  });
  assert.equal(added.active, false);
  assert.equal(added.requestConsentAt, null);
  const duplicateInput = restaurantDataFixture(`duplicate-${randomUUID()}`);
  duplicateInput.restaurants[1]!.name = duplicateInput.restaurants[0]!.name;
  duplicateInput.restaurants[1]!.address =
    duplicateInput.restaurants[0]!.address;
  await assert.rejects(service.import(duplicateInput, options), {
    code: "RESTAURANT_DUPLICATE",
  });
  // Late failure after a first write rolls the entire import back.
  const bad = restaurantDataFixture(`rollback-${randomUUID()}`);
  bad.restaurants[1]!.name = fixture.restaurants[1]!.name;
  bad.restaurants[1]!.address = fixture.restaurants[1]!.address;
  await assert.rejects(service.import(bad, { ...options, execute: true }), {
    code: "RESTAURANT_DUPLICATE",
  });
  assert.equal(
    await db.manager.existsBy(Restaurant, {
      id: restaurantSeedId("restaurant", bad.restaurants[0]!.key),
    }),
    false,
  );
  const original = await read(),
    auditCount = await db.manager.count(RestaurantOperation);
  await assert.rejects(
    service.update(
      {
        restaurants: [
          {
            id,
            expectedVersion: original.version,
            changes: { name: "rollback update" },
          },
          {
            key: fixture.restaurants[1]!.key,
            expectedVersion: 9999,
            changes: { published: false },
          },
        ],
      },
      { ...options, execute: true },
    ),
  );
  assert.deepEqual(await read(), original);
  assert.equal(await db.manager.count(RestaurantOperation), auditCount);
  const safe = await service.show({ id });
  assert.doesNotMatch(JSON.stringify(safe), /01000009999/);
  // Owner registration uses random IDs and has no initial catalog key.
  const ownerRestaurantId = randomUUID();
  await db.manager.insert(Restaurant, {
    ...(await read()),
    id: ownerRestaurantId,
    name: `사장 등록 ${first.key}`,
    version: 1,
  });
  const ownerMenu = { ...first.menus[0]!, position: 0 };
  const { key: ownerMenuKey, ...ownerMenuFields } = ownerMenu;
  await service.update(
    {
      restaurants: [
        {
          id: ownerRestaurantId,
          expectedVersion: 1,
          changes: {
            menus: [
              { action: "add", key: ownerMenuKey, data: ownerMenuFields },
            ],
          },
        },
      ],
    },
    { ...options, execute: true },
  );
  await service.update(
    {
      restaurants: [
        {
          id: ownerRestaurantId,
          expectedVersion: 2,
          changes: {
            menus: [
              { action: "update", key: ownerMenuKey, changes: { price: null } },
            ],
          },
        },
      ],
    },
    { ...options, execute: true },
  );
  const ownerMenus = await db.manager.findBy(RestaurantMenu, {
    restaurantId: ownerRestaurantId,
  });
  assert.equal(ownerMenus.length, 1);
  assert.equal(ownerMenus[0]!.price, null);
  assert.notEqual(ownerMenus[0]!.id, menuId);
  const invalid = structuredClone(fixture) as unknown as {
    restaurants: Record<string, unknown>[];
  };
  invalid.restaurants[0]!.isDemo = false;
  await assert.rejects(service.import(invalid, { ...options, execute: true }), {
    code: "VALIDATION_FAILED",
  });
  invalid.restaurants[0] = { ...first, contact: { phone: "00000000000" } };
  await assert.rejects(service.import(invalid, options), {
    code: "VALIDATION_FAILED",
  });
});

test("batch update previews and execution share normalized planned identities and rollback collisions", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const db = new DataSource(
    databaseOptions({ databaseUrl: process.env.TEST_DATABASE_URL }),
  );
  await db.initialize();
  t.after(() => db.destroy());
  await db.runMigrations();
  const service = new RestaurantDataService(new DatabaseService(db));
  const prefix = `batch-${randomUUID()}`;
  const fixture = restaurantDataFixture(prefix);
  await service.import(fixture, { ...options, execute: true });
  const ids = fixture.restaurants
    .map((r) => restaurantSeedId("restaurant", r.key))
    .sort((a, b) => a.localeCompare(b));
  const read = () =>
    Promise.all(
      ids.map((id) => db.manager.findOneByOrFail(Restaurant, { id })),
    );
  const before = await read(),
    [first, second, untouched] = before;
  const auditCount = await db.manager.count(RestaurantOperation);
  const identity = {
    name: `중복 ${prefix}`,
    address: "가상로 11",
    latitude: null,
    longitude: null,
  };
  const patch = (row: Restaurant, changes: typeof identity) => ({
    id: row.id,
    expectedVersion: row.version,
    changes,
  });
  const unchanged = async () => {
    assert.deepEqual(await read(), before);
    assert.equal(await db.manager.count(RestaurantOperation), auditCount);
  };

  for (const variant of [
    identity,
    {
      ...identity,
      name: `중복\t  ${prefix}`.normalize("NFD"),
      address: "가상로\t  11".normalize("NFD"),
    },
  ]) {
    // Reverse input order: execution still follows the existing sorted ID order.
    const batch = {
      restaurants: [patch(second!, variant), patch(first!, identity)],
    };
    for (const execute of [false, true]) {
      await assert.rejects(service.update(batch, { ...options, execute }), {
        code: "RESTAURANT_DUPLICATE",
      });
      await unchanged(); // The second collision must roll back the first row and its audit.
    }
  }

  const existing = {
    ...identity,
    name: untouched!.name,
    address: untouched!.address,
  };
  for (const execute of [false, true]) {
    await assert.rejects(
      service.update(
        { restaurants: [patch(first!, existing)] },
        { ...options, execute },
      ),
      { code: "RESTAURANT_DUPLICATE" },
    );
    await unchanged();
  }

  // A preceding row releases its old identity; preview must not still match its old DB values.
  const batch = {
    restaurants: [
      patch(second!, {
        ...identity,
        name: first!.name,
        address: first!.address,
      }),
      patch(first!, identity),
    ],
  };
  assert.equal((await service.update(batch, options)).updated, 2);
  await unchanged();
  const stale = structuredClone(batch);
  stale.restaurants[0]!.expectedVersion++;
  for (const execute of [false, true]) {
    await assert.rejects(service.update(stale, { ...options, execute }), {
      code: "RESTAURANT_VERSION_CONFLICT",
    });
    await unchanged();
  }
  assert.equal(
    (await service.update(batch, { ...options, execute: true })).updated,
    2,
  );
  const after = await read();
  assert.equal(after[0]!.name, identity.name);
  assert.equal(after[0]!.address, identity.address);
  assert.equal(after[1]!.name, first!.name);
  assert.equal(after[1]!.address, first!.address);
  assert.equal(after[0]!.version, first!.version + 1);
  assert.equal(after[1]!.version, second!.version + 1);
  assert.deepEqual(after.slice(2), before.slice(2));
  assert.equal(await db.manager.count(RestaurantOperation), auditCount + 2);
});
