import assert from "node:assert/strict";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";

test("first setup lets verified signups choose either role once and preserves an existing owner", async (t) => {
  const { call, signup, existingOwner } = await startResourceApplication(t);
  const organizer = await signup();
  const owner = await signup();
  const racingAccount = await signup();
  const configuredOwner = await existingOwner();
  const me = async (cookie: string) =>
    (await (await call("auth/session/restore", cookie, "POST")).json()).account;
  const save = (body: unknown, cookie = organizer) =>
    call("auth/first-setup", cookie, "PATCH", body);
  const newAccount = await me(organizer);
  const ownerAccount = await me(owner);
  const existingAccount = await me(configuredOwner);

  assert.equal(newAccount.accountType, null);
  assert.equal(newAccount.nickname, null);
  assert.equal((await save({ nickname: "총무" }, "")).status, 401);
  assert.equal(
    (await save({ accountType: "organizer", accountId: ownerAccount.id }))
      .status,
    400,
  );
  assert.equal((await save({ nickname: "총무" })).status, 400);
  assert.equal((await save({ accountType: "organizer" })).status, 200);
  assert.equal((await me(organizer)).nickname, null);
  assert.equal((await save({ accountType: "owner" })).status, 409);
  assert.equal((await save({ nickname: "총무" })).status, 200);
  assert.equal((await save({ nickname: "다른 이름" })).status, 409);
  const organizerLogin = await call("auth/login", "", "POST", {
    email: newAccount.email,
    password: "group-events-123",
  });
  assert.equal(organizerLogin.status, 200);
  assert.equal((await organizerLogin.json()).account.nickname, "총무");

  assert.equal(ownerAccount.accountType, null);
  assert.equal((await call("owner/context", owner)).status, 403);
  assert.equal(
    (await save({ accountType: "owner", nickname: "사장님" }, owner)).status,
    400,
  );
  assert.equal((await save({ accountType: "owner" }, owner)).status, 200);
  assert.equal((await call("owner/context", owner)).status, 200);
  assert.equal((await call("owner/context", organizer)).status, 403);
  assert.equal((await save({ accountType: "organizer" }, owner)).status, 409);

  const race = await Promise.all([
    save({ accountType: "owner" }, racingAccount),
    save({ accountType: "organizer" }, racingAccount),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const accepted = race.find((response) => response.status === 200)!;
  assert.equal(
    (await me(racingAccount)).accountType,
    (await accepted.json()).accountType,
  );

  const ownerLogin = await call("auth/login", "", "POST", {
    email: ownerAccount.email,
    password: "group-events-123",
  });
  assert.equal(ownerLogin.status, 200);
  assert.equal((await ownerLogin.json()).account.accountType, "owner");
  assert.equal(
    (await save({ accountType: "owner" }, configuredOwner)).status,
    200,
  );
  assert.equal(
    (await save({ accountType: "organizer" }, configuredOwner)).status,
    409,
  );
  assert.deepEqual(await me(configuredOwner), existingAccount);
});
