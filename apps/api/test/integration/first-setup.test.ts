import assert from "node:assert/strict";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";

test("first setup is organizer-only for new and unfinished accounts and preserves existing owners", async (t) => {
  const { db, call, signup, existingOwner } = await startResourceApplication(t);
  const jar = await signup();
  const legacy = await signup();
  const owner = await existingOwner();
  const me = async (cookie: string) =>
    (await (await call("auth/session/restore", cookie, "POST")).json()).account;
  const save = (body: unknown, cookie = jar) =>
    call("auth/first-setup", cookie, "PATCH", body);
  const newAccount = await me(jar);
  const legacyAccount = await me(legacy);
  const ownerAccount = await me(owner);
  await db.manager.update(
    Account,
    { id: legacyAccount.id },
    {
      accountType: null,
    },
  );

  assert.equal(newAccount.accountType, "organizer");
  assert.equal(newAccount.nickname, null);
  assert.equal((await save({ nickname: "총무" }, "")).status, 401);
  assert.equal(
    (await save({ nickname: "총무", accountId: legacyAccount.id })).status,
    400,
  );
  assert.equal((await save({ accountType: "owner" })).status, 409);
  assert.equal((await save({ nickname: "총무" })).status, 200);
  assert.equal((await save({ nickname: "다른 이름" })).status, 409);
  const organizerLogin = await call("auth/login", "", "POST", {
    email: newAccount.email,
    password: "group-events-123",
  });
  assert.equal(organizerLogin.status, 200);
  assert.equal((await organizerLogin.json()).account.nickname, "총무");

  const before = await save({ accountType: "owner" }, legacy);
  assert.equal(before.status, 409);
  assert.equal((await before.json()).code, "PILOT_ORGANIZER_SIGNUP_ONLY");
  assert.equal((await me(legacy)).accountType, null);
  const race = await Promise.all([
    save({ accountType: "owner" }, legacy),
    save({ accountType: "organizer", nickname: "기존 총무" }, legacy),
  ]);
  assert.deepEqual(
    race.map((response) => response.status),
    [409, 200],
  );
  assert.equal((await me(legacy)).accountType, "organizer");
  assert.equal((await me(legacy)).nickname, "기존 총무");

  const ownerLogin = await call("auth/login", "", "POST", {
    email: ownerAccount.email,
    password: "group-events-123",
  });
  assert.equal(ownerLogin.status, 200);
  assert.equal((await ownerLogin.json()).account.accountType, "owner");
  assert.equal((await save({ accountType: "owner" }, owner)).status, 200);
  assert.equal((await save({ accountType: "organizer" }, owner)).status, 409);
  assert.equal((await save({ nickname: "사장님" }, owner)).status, 400);
  assert.deepEqual(await me(owner), ownerAccount);
});
