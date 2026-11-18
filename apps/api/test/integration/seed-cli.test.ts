import "reflect-metadata";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DataSource, In } from "typeorm";
import { databaseOptions } from "../../src/database/database-options.js";
import { restaurantSeedId } from "../../src/database/seeds/restaurants.seed.js";
import fixture from "../../src/database/seeds/data/restaurants.json" with { type: "json" };
import { Restaurant } from "../../src/modules/restaurants/entities/restaurant.entity.js";
import { RestaurantContact } from "../../src/modules/restaurants/entities/restaurant-contact.entity.js";
import { RestaurantMenu } from "../../src/modules/restaurants/entities/restaurant-menu.entity.js";
import { RestaurantSpace } from "../../src/modules/restaurants/entities/restaurant-space.entity.js";

test("compiled seed CLI runs without source or HTTP configuration and rejects unsafe input without leaking it", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const directory = await mkdtemp(path.join(tmpdir(), "chongmuya-seed-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Ship only compiled output and dependencies: no src tree, .env or private data.
  await cp(
    new URL("../../src/", import.meta.url),
    path.join(directory, "dist"),
    {
      recursive: true,
    },
  );
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await symlink(
    fileURLToPath(new URL("../../../node_modules", import.meta.url)),
    path.join(directory, "node_modules"),
    "dir",
  );
  assert.deepEqual(
    await readdir(path.join(directory, "dist/database/seeds/data")),
    ["restaurants.json"],
  );
  const run = (args: string[], environment: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(
      process.execPath,
      [path.join(directory, "dist/database/seeds/run-seed.js"), ...args],
      {
        cwd: directory,
        env: {
          NODE_ENV: "test",
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          ...environment,
        },
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    assert.equal(result.error, undefined);
    return result;
  };
  for (const [args, environment] of [
    [["restaurants"], { NODE_ENV: "production" }],
    [
      ["restaurants"],
      {
        DATABASE_URL:
          "postgresql://user:secret-sentinel@db.example.test/catalog",
      },
    ],
    [
      ["restaurants"],
      { DATABASE_URL: "postgresql://localhost/catalog?host=secret-sentinel" },
    ],
    [["restaurants", "--unknown", "secret-sentinel"], {}],
    [["restaurants-demo", "--contacts-file", "secret-sentinel"], {}],
    [["restaurants", "--contacts-file", "secret-sentinel"], {}],
  ] as [string[], NodeJS.ProcessEnv][]) {
    const result = run(args, environment);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(
      result.stderr,
      /secret-sentinel|postgresql:|Error:| at /,
    );
  }

  const db = new DataSource(
    databaseOptions({ databaseUrl: process.env.TEST_DATABASE_URL }),
  );
  await db.initialize();
  t.after(() => db.destroy());
  await db.runMigrations();
  const ids = fixture.restaurants.map(({ key }) =>
    restaurantSeedId("restaurant", key),
  );
  const restaurants = db.getRepository(Restaurant);
  const contacts = db.getRepository(RestaurantContact);
  const menus = db.getRepository(RestaurantMenu);
  const spaces = db.getRepository(RestaurantSpace);
  try {
    assert.equal(run(["restaurants"]).status, 0);
    assert.equal(await contacts.countBy({ restaurantId: In(ids) }), 0);
    const privateFile = path.join(directory, "contacts.private.json");
    await writeFile(
      privateFile,
      JSON.stringify({
        contacts: [
          {
            restaurantKey: fixture.restaurants[0]!.key,
            name: "CLI 테스트 담당자",
            phone: "invalid-secret-sentinel",
          },
        ],
      }),
    );
    const invalid = run(["restaurants", "--contacts-file", privateFile]);
    assert.equal(invalid.status, 1);
    assert.doesNotMatch(
      invalid.stderr,
      /secret-sentinel|contacts.private.json|CLI 테스트 담당자|INSERT|Error:/,
    );
    await writeFile(
      privateFile,
      JSON.stringify({
        contacts: fixture.restaurants.map(({ key }) => ({
          restaurantKey: key,
          name: "CLI 테스트 담당자",
          phone: "00000000000",
        })),
      }),
    );
    for (let i = 0; i < 2; i++) {
      const result = run(["restaurants", "--contacts-file", privateFile]);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /00000000000|CLI 테스트 담당자/,
      );
      assert.equal(run(["restaurants-demo"]).status, 0);
    }
    assert.equal(await restaurants.countBy({ id: In(ids), isDemo: false }), 4);
    assert.equal(await restaurants.countBy({ isDemo: true }), 4);
    assert.equal(await spaces.countBy({ restaurantId: In(ids) }), 11);
    assert.equal(await menus.countBy({ restaurantId: In(ids) }), 146);
    assert.equal(await contacts.countBy({ restaurantId: In(ids) }), 4);
  } finally {
    await contacts.delete({ restaurantId: In(ids) });
    await menus.delete({ restaurantId: In(ids) });
    await spaces.delete({ restaurantId: In(ids) });
    await restaurants.delete({ id: In(ids) });
  }
});
