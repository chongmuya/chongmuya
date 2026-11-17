import { PasswordResetService } from "../../src/modules/auth/password-reset.service.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { DataSource } from "typeorm";
import { startTestApplication } from "../support/test-application.js";
import { signupFixture } from "../support/signup-fixture.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { AuthSession } from "../../src/modules/auth/entities/auth-session.entity.js";
import { PasswordReset } from "../../src/modules/auth/entities/password-reset.entity.js";
import { ResendMailService } from "../../src/modules/auth/resend-mail.service.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
const headers = {
  Origin: "http://localhost:3000",
  "X-CSRF-Protection": "1",
  "Content-Type": "application/json",
};
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
async function until(action: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await action()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("condition did not settle");
}

test("password reset preserves response privacy, consumes atomically, rolls back and revokes only the target account", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app, url, logs } = await startTestApplication(
    process.env.TEST_DATABASE_URL,
  );
  t.after(() => app.close());
  await app.get(DatabaseService).connect();
  const db = app.get(DataSource);
  await db.runMigrations();
  for (const key of [
    "ip:127.0.0.1",
    "reset-issue-ip:127.0.0.1",
    "reset-check-ip:127.0.0.1",
    "reset-save-ip:127.0.0.1",
  ])
    await db.manager.delete(AuthAttempt, { key: tokenHash(key) });
  const post = (path: string, body: unknown, jar = "") =>
    fetch(`${url}/api/v1/auth/${path}`, {
      method: "POST",
      headers: { ...headers, Cookie: jar },
      body: JSON.stringify(body),
    });
  const fixture = await signupFixture(db),
    other = await signupFixture(db);
  const password = "reset-old-123",
    nextPassword = "reset-new-123";
  const created = await post(
    "signup",
    { ...fixture.body, password },
    fixture.jar,
  );
  assert.equal(created.status, 201);
  const accountId = (await created.json()).account.id as string,
    first = cookies(created);
  const second = cookies(
    await post("login", { email: fixture.body.email, password }),
  );
  const otherJar = cookies(
    await post("signup", { ...other.body, password }, other.jar),
  );
  const social = await signupFixture(db);
  const socialCreated = await post(
    "signup",
    { ...social.body, password },
    social.jar,
  );
  const socialId = (await socialCreated.json()).account.id as string;
  await db.manager.update(Account, { id: socialId }, { passwordHash: null });
  const deliveries: {
    to: string;
    subject: string;
    text: string;
    id: string;
  }[] = [];
  let failMail = false;
  t.mock.method(
    app.get(ResendMailService),
    "send",
    async (to: string, subject: string, text: string, id: string) => {
      deliveries.push({ to, subject, text, id });
      if (failMail) throw new Error("private provider detail");
    },
  );
  const responses = [];
  for (const email of [
    fixture.body.email,
    `${randomUUID()}@example.test`,
    social.body.email,
  ]) {
    const response = await post("password-reset/request", {
      email,
      next: "/mypage",
    });
    responses.push({ status: response.status, body: await response.json() });
  }
  assert.deepEqual(
    responses,
    Array.from({ length: 3 }, () => ({
      status: 202,
      body: { accepted: true },
    })),
  );
  assert.equal(deliveries.length, 1);
  const link = new URL(deliveries[0].text.split("\n").at(-1)!);
  assert.equal(link.origin, headers.Origin);
  assert.equal(link.searchParams.get("next"), "/mypage");
  const token = new URLSearchParams(link.hash.slice(1)).get("token")!;
  const hash = tokenHash(`password-reset:${token}`);
  await until(
    async () =>
      (await db.manager.findOneByOrFail(PasswordReset, { hash })).delivery ===
      "sent",
  );
  const get = await fetch(
    `${url}/api/v1/auth/password-reset/check?token=${token}`,
  );
  assert.equal(get.status, 404);
  for (let i = 0; i < 2; i++)
    assert.equal((await post("password-reset/check", { token })).status, 200);
  assert.equal(
    (await db.manager.findOneByOrFail(PasswordReset, { hash })).usedAt,
    null,
  );
  assert.equal(
    (await post("password-reset/check", { token: "z".repeat(43) })).status,
    400,
  );
  assert.equal(
    (
      await post("password-reset/confirm", {
        token: fixture.body.emailVerificationId,
        password: nextPassword,
      })
    ).status,
    400,
  );
  await db.manager.update(
    PasswordReset,
    { hash },
    { expiresAt: new Date(Date.now() - 1) },
  );
  assert.equal((await post("password-reset/check", { token })).status, 400);
  await db.manager.update(
    PasswordReset,
    { hash },
    { expiresAt: new Date(Date.now() + 60_000) },
  );
  const trigger = `reset_${randomUUID().replaceAll("-", "")}`;
  await db.query(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."accountId" = '${accountId}'::uuid THEN RAISE EXCEPTION 'test-only rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE UPDATE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  try {
    assert.equal(
      (await post("password-reset/confirm", { token, password: nextPassword }))
        .status,
      500,
    );
    assert.equal(
      (await db.manager.findOneByOrFail(PasswordReset, { hash })).usedAt,
      null,
    );
    assert.equal(
      (await fetch(`${url}/api/v1/auth/me`, { headers: { Cookie: first } }))
        .status,
      200,
    );
  } finally {
    await db.query(
      `DROP TRIGGER ${trigger} ON auth_sessions; DROP FUNCTION ${trigger}()`,
    );
  }
  failMail = true; // Notification failure after commit must not change the successful result.
  const saves = await Promise.all([
    post("password-reset/confirm", { token, password: nextPassword }),
    post("password-reset/confirm", { token, password: nextPassword }),
  ]);
  assert.deepEqual(saves.map((response) => response.status).sort(), [204, 400]);
  assert(
    saves.every((response) => response.headers.getSetCookie().length === 0),
    "reset never logs in or overwrites another account's cookies",
  );
  for (const jar of [first, second]) {
    assert.equal(
      (await fetch(`${url}/api/v1/auth/me`, { headers: { Cookie: jar } }))
        .status,
      401,
    );
    assert.equal((await post("refresh", {}, jar)).status, 401);
  }
  assert.equal(
    (await fetch(`${url}/api/v1/auth/me`, { headers: { Cookie: otherJar } }))
      .status,
    200,
  );
  assert.equal(
    (await post("login", { email: fixture.body.email, password })).status,
    401,
  );
  assert.equal(
    (await post("login", { email: fixture.body.email, password: nextPassword }))
      .status,
    200,
  );
  assert.equal(
    (await post("login", { email: social.body.email, password })).status,
    401,
  );
  assert.equal((await post("password-reset/check", { token })).status, 400);
  assert(
    deliveries.some(
      (mail) =>
        mail.subject.includes("변경 안내") && !mail.text.includes(nextPassword),
    ),
  );
  // A failed issuance remains generic and does not revoke the new session.
  await db.manager.update(
    PasswordReset,
    { hash },
    { createdAt: new Date(Date.now() - 61_000) },
  );
  failMail = true;
  assert.equal(
    (await post("password-reset/request", { email: fixture.body.email }))
      .status,
    202,
  );
  await until(
    async () =>
      !!(await db.manager.findOneBy(PasswordReset, {
        accountId,
        delivery: "failed",
      })),
  );
  assert(!JSON.stringify(logs).includes(token));
  assert(!JSON.stringify(logs).includes(password));
  assert(!JSON.stringify(logs).includes("private provider"));
  // Requesting recovery never locks the account or revokes the latest valid session.
  assert.equal(
    (await post("login", { email: fixture.body.email, password: nextPassword }))
      .status,
    200,
  );
});

test("old password verified before reset cannot create a session after reset; concurrent refresh is revoked", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app } = await startTestApplication(process.env.TEST_DATABASE_URL);
  t.after(() => app.close());
  await app.get(DatabaseService).connect();
  const db = app.get(DataSource);
  await db.runMigrations();
  const fixture = await signupFixture(db),
    auth = app.get(AuthService);
  const original = await auth.signup(
    { ...fixture.body, password: "old-password1" },
    randomUUID(),
    fixture.jar.split("=")[1],
  );
  const account = await db.manager.findOneByOrFail(Account, {
    id: original.account.id,
  });
  t.mock.method(app.get(ResendMailService), "send", async () => undefined);
  const token = randomBytes(32).toString("base64url");
  await db.manager.insert(PasswordReset, {
    hash: tokenHash(`password-reset:${token}`),
    accountId: account.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    delivery: "sent",
    usedAt: null,
    invalidatedAt: null,
  });
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.manager.findOneOrFail(Account, {
      where: { id: account.id },
      lock: { mode: "pessimistic_write" },
    });
    const reset = app
      .get(PasswordResetService)
      .reset(token, "new-password1", randomUUID());
    const waiting = async (count: number) =>
      until(async () => {
        const waits = await db.query<{ count: string }[]>(
          "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
        );
        return Number(waits[0].count) >= count;
      });
    await waiting(1); // reset has completed scrypt and queued its credential lock first
    const results = Promise.allSettled([
      auth.login(
        { email: account.email, password: "old-password1" },
        randomUUID(),
      ),
      auth.refresh(original.refresh),
    ]);
    await waiting(3); // login verified the old password while reset was still uncommitted
    await runner.commitTransaction();
    await reset;
    assert((await results).every((result) => result.status === "rejected"));
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
  assert.equal(
    await db.manager.countBy(AuthSession, { accountId: account.id }),
    1,
  );
});

test("reset reissue races create one delivery, invalidate old links and retain aggregate issue/check limits", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app } = await startTestApplication(process.env.TEST_DATABASE_URL);
  t.after(() => app.close());
  await app.get(DatabaseService).connect();
  const db = app.get(DataSource);
  await db.runMigrations();
  const fixture = await signupFixture(db);
  const account = await app
    .get(AuthService)
    .signup(
      { ...fixture.body, password: "email-password1" },
      randomUUID(),
      fixture.jar.split("=")[1],
    );
  const service = app.get(PasswordResetService),
    mail: string[] = [];
  t.mock.method(
    app.get(ResendMailService),
    "send",
    async (_to: string, _subject: string, text: string) => {
      mail.push(text);
    },
  );
  const issue = () =>
    service.request(
      fixture.body.email,
      randomUUID(),
      "https://evil.example/return",
    );
  await Promise.all([issue(), issue()]);
  assert.equal(mail.length, 1);
  const safeLink = new URL(mail[0].split("\n").at(-1)!);
  assert.equal(safeLink.origin, headers.Origin);
  assert.equal(safeLink.searchParams.get("next"), "/events");
  const getToken = (text: string) =>
    new URLSearchParams(new URL(text.split("\n").at(-1)!).hash.slice(1)).get(
      "token",
    )!;
  const first = getToken(mail[0]);
  await db.manager.update(
    PasswordReset,
    { accountId: account.account.id },
    { createdAt: new Date(Date.now() - 61_000) },
  );
  await Promise.all([issue(), issue()]);
  assert.equal(mail.length, 2);
  const next = getToken(mail[1]);
  await until(
    async () =>
      (
        await db.manager.findOneByOrFail(PasswordReset, {
          hash: tokenHash(`password-reset:${next}`),
        })
      ).delivery === "sent",
  );
  await assert.rejects(() => service.check(first, randomUUID()));
  for (let i = 0; i < 10; i++) await service.check(next, randomUUID());
  await assert.rejects(
    () => service.check(next, randomUUID()),
    (error: unknown) => (error as { getStatus(): number }).getStatus() === 429,
  );
  await issue(); // fifth email request still subject to resend interval
  await db.manager.update(
    PasswordReset,
    { accountId: account.account.id },
    { createdAt: new Date(Date.now() - 61_000) },
  );
  assert.deepEqual(await issue(), { accepted: true });
  assert.equal(
    mail.length,
    2,
    "changing IP or reissuing cannot reset the email issue budget",
  );
});
