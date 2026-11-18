import assert from "node:assert/strict";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";

test("first setup saves only the signed-in account, resumes after login and preserves established types/nicknames", async (t) => {
  const { db, call, signup } = await startResourceApplication(t);
  const jar = await signup(),
    other = await signup();
  const me = async (cookie: string) =>
    (await (await call("auth/session/restore", cookie, "POST")).json()).account;
  const a = await me(jar),
    b = await me(other);
  assert.equal(a.accountType, null);
  assert.equal(a.nickname, null);
  const save = (body: unknown, cookie = jar) =>
    call("auth/first-setup", cookie, "PATCH", body);
  assert.equal((await save({ accountType: "organizer" }, "")).status, 401);
  assert.equal(
    (await save({ accountType: "organizer", accountId: b.id })).status,
    400,
  );
  assert.equal((await save({ nickname: "총무" })).status, 400);
  assert.equal((await save({ accountType: "organizer" })).status, 200);
  assert.equal((await me(jar)).nickname, null);
  const login = await call("auth/login", "", "POST", {
    email: a.email,
    password: "group-events-123",
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).account.accountType, "organizer");
  assert.equal((await save({ nickname: "총무" })).status, 200);
  assert.equal((await me(jar)).nickname, "총무");
  assert.equal((await save({ accountType: "owner" })).status, 409);
  assert.equal((await save({ nickname: "다른 이름" })).status, 409);
  assert.equal((await me(other)).accountType, null);
  assert.equal(
    (await save({ accountType: "owner", nickname: "가짜" }, other)).status,
    400,
  );
  assert.equal((await save({ accountType: "owner" }, other)).status, 200);
  assert.equal((await me(other)).accountType, "owner");
  await db
    .getRepository(Account)
    .update({ id: b.id }, { accountType: "owner" });
  const ownerLogin = await call("auth/login", "", "POST", {
    email: b.email,
    password: "group-events-123",
  });
  assert.equal(ownerLogin.status, 200);
  assert.equal((await ownerLogin.json()).account.accountType, "owner");
  const owner = await me(other);
  assert.equal(owner.nickname, null);
  assert.equal(owner.name, b.name);
  await db
    .getRepository(Account)
    .update({ id: b.id }, { nickname: "기존 닉네임" });
  assert.equal((await save({ accountType: "owner" }, other)).status, 200);
  assert.equal((await me(other)).nickname, "기존 닉네임");
  const fresh = await signup();
  const race = await Promise.all([
    save({ accountType: "owner" }, fresh),
    save({ accountType: "organizer" }, fresh),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
});
