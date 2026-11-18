import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Repository } from "typeorm";
import { Group } from "../../src/modules/groups/entities/group.entity.js";
import { GroupMember } from "../../src/modules/groups/entities/group-member.entity.js";
import { startResourceApplication } from "../support/resource-application.js";

test("group roster is atomic, private, preserves duplicates and leading zeroes, and retries only once", async (t) => {
  const { db, signup, call } = await startResourceApplication(t);
  const owner = await signup();
  const stranger = await signup();
  const input = {
    name: "사진 모임",
    groupType: "동아리",
    creationKey: randomUUID(),
    members: [
      { name: "김민수", phoneLast4: "0012" },
      { name: "김민수" },
      { name: "Alex Kim", phoneLast4: "0012" },
    ],
    duplicatesConfirmed: true,
  };
  const unconfirmed = await call("groups", owner, "POST", {
    ...input,
    duplicatesConfirmed: false,
  });
  assert.equal(
    (await unconfirmed.json()).code,
    "ROSTER_DUPLICATES_UNCONFIRMED",
  );
  for (const members of [
    [{ name: " " }],
    [{ name: "A", phoneLast4: "123" }],
    [{ name: "A", phoneLast4: 12 }],
    [{ name: "A", accountId: randomUUID() }],
  ])
    assert.equal(
      (await call("groups", owner, "POST", { ...input, members })).status,
      400,
    );
  const results = await Promise.all([
    call("groups", owner, "POST", input),
    call("groups", owner, "POST", input),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  const [group, repeated] = await Promise.all(results.map((r) => r.json()));
  assert.deepEqual(repeated, group);
  assert.equal(group.groupType, "동아리");
  assert.equal(group.memberCount, 3);
  const members = await (
    await call(`groups/${group.id}/members`, owner)
  ).json();
  assert.equal(new Set(members.map((m: { id: string }) => m.id)).size, 3);
  assert.deepEqual(
    members.map(
      ({ name, phoneLast4 }: { name: string; phoneLast4: string | null }) => ({
        name,
        phoneLast4,
      }),
    ),
    input.members.map((m) => ({
      name: m.name,
      phoneLast4: m.phoneLast4 ?? null,
    })),
  );
  assert.equal(
    (await call(`groups/${group.id}/members`, stranger)).status,
    404,
  );
  assert.equal((await call(`groups/${group.id}/members`)).status, 401);
  assert.equal(
    (await call("groups", owner, "POST", { ...input, name: "다른 입력" }))
      .status,
    409,
  );
  assert.equal(
    await db.getRepository(Group).countBy({ creationKey: input.creationKey }),
    1,
  );
  assert.equal(
    await db.getRepository(GroupMember).countBy({ groupId: group.id }),
    3,
  );
  const empty = await (
    await call("groups", owner, "POST", {
      name: "명단 없이",
      creationKey: randomUUID(),
    })
  ).json();
  assert.equal(empty.groupType, null);
  assert.equal(empty.memberCount, 0);
  assert.deepEqual(
    await (await call(`groups/${empty.id}/members`, owner)).json(),
    [],
  );
  const personal = await (
    await call("events", owner, "POST", { name: "개인 행사" })
  ).json();
  assert.equal(personal.groupId, null);
  const longRoster = Array.from({ length: 500 }, (_, index) => ({
    name: `${index}${"가".repeat(95)}`,
    phoneLast4: "0001",
  }));
  const large = await call("groups", owner, "POST", {
    name: "긴 명단",
    creationKey: randomUUID(),
    members: longRoster,
  });
  assert.equal(large.status, 201);
  assert.equal((await large.json()).memberCount, 500);
  assert.equal(
    (
      await call("groups", owner, "POST", {
        name: "명단 제한",
        members: [...longRoster, { name: "501번째" }],
      })
    ).status,
    400,
  );
  // Fail the member write after the group insert, inside the same real DB transaction.
  const original = Repository.prototype.insert;
  const failure = t.mock.method(
    Repository.prototype,
    "insert",
    function (this: Repository<object>, ...args: Parameters<typeof original>) {
      if (this.target === GroupMember)
        throw new Error("injected roster write failure");
      return original.apply(this, args);
    },
  );
  const failedKey = randomUUID();
  try {
    assert.equal(
      (
        await call("groups", owner, "POST", {
          ...input,
          creationKey: failedKey,
        })
      ).status,
      500,
    );
    assert.equal(
      await db.getRepository(Group).countBy({ creationKey: failedKey }),
      0,
    );
  } finally {
    failure.mock.restore();
  }
  const retry = await call("groups", owner, "POST", {
    ...input,
    creationKey: failedKey,
  });
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).memberCount, 3);
});
