import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { startTestApplication } from "../support/test-application.js";
import { tokenHash } from "../../src/modules/auth/auth.repository.js";
import { DatabaseService } from "../../src/database/database.service.js";
import {
  Account,
  AuthSession,
  AuthAttempt,
  RefreshToken,
} from "../../src/modules/auth/auth.entity.js";

const origin = "http://localhost:3000";
const headers = {
  Origin: origin,
  "X-CSRF-Protection": "1",
  "Content-Type": "application/json",
};
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

test("authentication PostgreSQL HTTP lifecycle, rotation, replay, CSRF, authorization and rate limits", async (t) => {
  assert(
    process.env.TEST_DATABASE_URL,
    "TEST_DATABASE_URL must point to an isolated test database",
  );
  const { app, url, logs } = await startTestApplication(
    process.env.TEST_DATABASE_URL,
  );
  t.after(() => app.close());
  await app.get(DatabaseService).connect();
  const db = app.get(DataSource);
  // Test database only: migrations are explicitly applied here, never at server startup.
  await db.runMigrations();
  // Keep repeated runs independent; only this isolated test client's limiter row.
  await db
    .getRepository(AuthAttempt)
    .delete({ key: tokenHash("ip:127.0.0.1") });
  assert.deepEqual(
    (await db.driver.createSchemaBuilder().log()).upQueries,
    [],
    "entity metadata must match the applied migration",
  );
  const post = (path: string, jar = "", body?: unknown, extra = {}) =>
    fetch(`${url}/api/v1/auth/${path}`, {
      method: "POST",
      headers: { ...headers, Cookie: jar, ...extra },
      body: body ? JSON.stringify(body) : undefined,
    });
  const me = (jar: string) =>
    fetch(`${url}/api/v1/auth/me`, { headers: { Cookie: jar } });
  const email = `${randomUUID()}@example.com`;
  const credentials = { email, password: "test-password-long-123" };
  const anonymous = await post("session/restore");
  assert.deepEqual(await anonymous.json(), {
    authenticated: false,
    account: null,
  });
  assert.equal(
    (await post("signup", "", credentials, { Origin: "https://evil.example" }))
      .status,
    403,
  );
  assert.equal(
    (await post("signup", "", credentials, { "X-CSRF-Protection": "" })).status,
    403,
  );
  assert.equal(
    (await post("signup", "", { ...credentials, role: "admin" })).status,
    400,
  );
  assert.equal(
    (await post("signup", "", { ...credentials, password: "short" })).status,
    400,
  );
  const signup = await post("signup", "", credentials, {
    "X-Forwarded-For": "198.51.100.77",
  });
  assert.equal(signup.status, 201);
  assert.equal(
    await db
      .getRepository(AuthAttempt)
      .countBy({ key: tokenHash("ip:198.51.100.77") }),
    0,
    "untrusted forwarded headers must not choose the rate-limit IP",
  );
  const first = cookies(signup);
  const identity = await signup.json();
  assert.deepEqual(Object.keys(identity.account).sort(), ["email", "id"]);
  assert.equal(identity.account.email, email);
  assert(
    signup.headers
      .getSetCookie()
      .every(
        (value) =>
          /HttpOnly/.test(value) &&
          /SameSite=Lax/.test(value) &&
          /Path=\//.test(value),
      ),
  );
  assert.equal(signup.headers.get("cache-control"), "no-store");
  const stored = await db
    .getRepository(Account)
    .findOneByOrFail({ id: identity.account.id });
  assert.notEqual(stored.passwordHash, credentials.password);
  assert.match(stored.passwordHash, /^scrypt-v1\$/);
  assert.equal((await post("signup", "", credentials)).status, 409);
  assert.equal(
    (
      await post("login", "", {
        ...credentials,
        password: "wrong-password-long",
      })
    ).status,
    401,
  );
  assert.equal((await me(first)).status, 200);
  assert.equal((await me("access=forged")).status, 401);
  const refreshOnly = first
    .split("; ")
    .filter((part) => part.startsWith("refresh="))
    .join("; ");
  assert.equal((await (await me(refreshOnly)).json()).code, "ACCESS_EXPIRED");
  const rotated = await post("refresh", first);
  assert.equal(rotated.status, 200);
  const second = cookies(rotated);
  assert.notEqual(first, second);
  assert.equal((await me(second)).status, 200);
  assert.equal((await post("refresh", first)).status, 401);
  assert.equal(
    (await me(second)).status,
    401,
    "replay revokes the entire family, including access JWT",
  );
  const login = await post("login", "", credentials);
  assert.equal(login.status, 200);
  const third = cookies(login);
  const sessions = await db
    .getRepository(AuthSession)
    .findBy({ accountId: identity.account.id });
  const active = sessions.find((session) => !session.revokedAt)!;
  const jwt = new JwtService();
  const sign = (sub: string, expiresIn: number) =>
    jwt.signAsync(
      { sid: active.id, sub },
      {
        secret: "test-secret-with-at-least-32-characters",
        algorithm: "HS256",
        issuer: "chongmuya-api",
        audience: "chongmuya-web",
        expiresIn,
      },
    );
  const expired = await sign(stored.id, -1);
  assert.equal(
    (await (await me(`access=${expired}`)).json()).code,
    "ACCESS_EXPIRED",
  );
  const foreign = await sign(randomUUID(), 300);
  assert.equal(
    (await me(`access=${foreign}`)).status,
    401,
    "JWT subject must own the server session",
  );
  const concurrent = await Promise.all([
    post("refresh", third),
    post("refresh", third),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 401]);
  assert.equal(
    (await me(cookies(concurrent.find((r) => r.status === 200)!))).status,
    401,
  );
  const fourth = cookies(await post("login", "", credentials));
  const race = await Promise.all([
    post("refresh", fourth),
    post("logout", fourth),
  ]);
  assert.equal(race[1].status, 204);
  assert.equal(
    (await me(cookies(race[0]) || fourth)).status,
    401,
    "logout wins over concurrent refresh",
  );
  assert.equal((await post("logout", fourth)).status, 204);
  const fifth = cookies(await post("login", "", credentials));
  await db
    .getRepository(AuthSession)
    .update({ accountId: stored.id }, { expiresAt: new Date(0) });
  assert.equal((await post("refresh", fifth)).status, 401);
  assert.deepEqual(await (await post("session/restore", fifth)).json(), {
    authenticated: false,
    account: null,
  });
  let limited: Response | undefined;
  for (let i = 0; i < 12; i++) {
    limited = await post("login", "", credentials);
    if (limited.status === 429) break;
  }
  assert.equal(limited?.status, 429);
  assert.doesNotMatch(
    JSON.stringify(logs),
    new RegExp(`${email}|test-password|scrypt-v1|refresh=`),
  );
  const spec = await (await fetch(`${url}/docs-json`)).json();
  for (const path of [
    "signup",
    "login",
    "me",
    "refresh",
    "logout",
    "session/restore",
  ])
    assert(spec.paths[`/api/v1/auth/${path}`]);
});

test("signup rolls back account, session and refresh token on either insert failure, then permits retry", async (t) => {
  assert(
    process.env.TEST_DATABASE_URL,
    "TEST_DATABASE_URL must point to an isolated test database",
  );
  const { app, url } = await startTestApplication(
    process.env.TEST_DATABASE_URL,
  );
  t.after(() => app.close());
  const db = await app.get(DatabaseService).connect();
  await db.runMigrations();
  await db
    .getRepository(AuthAttempt)
    .delete({ key: tokenHash("ip:127.0.0.1") });
  const post = (email: string) =>
    fetch(`${url}/api/v1/auth/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "rollback-test-password-123" }),
    });
  for (const table of ["auth_sessions", "refresh_tokens"] as const) {
    const email = `${randomUUID()}@example.com`;
    const beforeSessions = await db.getRepository(AuthSession).count();
    const beforeTokens = await db.getRepository(RefreshToken).count();
    // Real PostgreSQL failure, scoped to this test account. Never used by production code.
    const condition =
      table === "auth_sessions"
        ? 'SELECT 1 FROM accounts WHERE id = NEW."accountId"'
        : 'SELECT 1 FROM accounts a JOIN auth_sessions s ON s."accountId" = a.id WHERE s.id = NEW."sessionId"';
    await db.query(`CREATE FUNCTION auth_test_reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (${condition} AND email = '${email}') THEN
          RAISE EXCEPTION 'injected test insert failure';
        END IF;
        RETURN NEW;
      END $$`);
    try {
      await db.query(`CREATE TRIGGER auth_test_insert_failure BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION auth_test_reject_insert()`);
      const failure = await post(email);
      assert.equal(failure.status, 503);
      assert.equal(failure.headers.getSetCookie().length, 0);
      assert.equal(
        await db.getRepository(Account).countBy({ email }),
        0,
        "failed signup must not leave a registered account",
      );
      assert.equal(await db.getRepository(AuthSession).count(), beforeSessions);
      assert.equal(await db.getRepository(RefreshToken).count(), beforeTokens);
    } finally {
      await db.query(
        `DROP TRIGGER IF EXISTS auth_test_insert_failure ON ${table}`,
      );
      await db.query("DROP FUNCTION auth_test_reject_insert()");
    }
    const retry = await post(email);
    assert.equal(
      retry.status,
      201,
      "same email can retry after the storage failure",
    );
    const account = await db.getRepository(Account).findOneByOrFail({ email });
    const sessions = await db
      .getRepository(AuthSession)
      .findBy({ accountId: account.id });
    assert.equal(sessions.length, 1);
    assert.equal(
      await db
        .getRepository(RefreshToken)
        .countBy({ sessionId: sessions[0].id }),
      1,
    );
    assert.equal(
      (
        await fetch(`${url}/api/v1/auth/me`, {
          headers: { Cookie: cookies(retry) },
        })
      ).status,
      200,
    );
  }
  const email = `${randomUUID()}@example.com`;
  const concurrent = await Promise.all([post(email), post(email)]);
  assert.deepEqual(
    concurrent.map((response) => response.status).sort(),
    [201, 409],
  );
  const account = await db.getRepository(Account).findOneByOrFail({ email });
  const sessions = await db
    .getRepository(AuthSession)
    .findBy({ accountId: account.id });
  assert.equal(
    sessions.length,
    1,
    "duplicate signup must not create another session",
  );
  assert.equal(
    await db.getRepository(RefreshToken).countBy({ sessionId: sessions[0].id }),
    1,
  );
});

test("group onboarding and event isolation for two accounts and two owned groups", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app, url } = await startTestApplication(
    process.env.TEST_DATABASE_URL,
  );
  t.after(() => app.close());
  const db = await app.get(DatabaseService).connect();
  await db.runMigrations();
  await db
    .getRepository(AuthAttempt)
    .delete({ key: tokenHash("ip:127.0.0.1") });
  const call = (path: string, jar = "", method = "GET", body?: unknown) =>
    fetch(`${url}/api/v1/${path}`, {
      method,
      headers: { ...headers, Cookie: jar },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const signup = async () => {
    const response = await call("auth/signup", "", "POST", {
      email: `${randomUUID()}@example.com`,
      password: "group-events-password-123",
    });
    assert.equal(response.status, 201);
    return cookies(response);
  };
  const a = await signup();
  const b = await signup();
  assert.deepEqual(await (await call("groups", a)).json(), []);
  assert.equal((await call("groups")).status, 401);
  for (const body of [
    { name: " " },
    { name: "x".repeat(101) },
    { name: "모임", ownerId: randomUUID() },
  ]) {
    assert.equal((await call("groups", a, "POST", body)).status, 400);
  }
  const createGroup = async (name: string, jar: string) => {
    const response = await call("groups", jar, "POST", { name });
    assert.equal(response.status, 201);
    return (await response.json()) as { id: string; name: string };
  };
  const g1 = await createGroup(" 첫 모임 ", a);
  const g2 = await createGroup("두 번째 모임", a);
  const other = await createGroup("타인 모임", b);
  assert.equal(g1.name, "첫 모임");
  assert.deepEqual(
    (await (await call("groups", a)).json())
      .map((g: { id: string }) => g.id)
      .sort(),
    [g1.id, g2.id].sort(),
  );
  const events = `groups/${g1.id}/events`;
  const created = await call(events, a, "POST", { name: "명단 없는 행사" });
  assert.equal(created.status, 201);
  const event = await created.json();
  assert.equal(event.groupId, g1.id);
  assert.equal(event.scheduledAt, null);
  assert.deepEqual(await (await call(events, a)).json(), [event]);
  assert.deepEqual(await (await call(`groups/${g2.id}/events`, a)).json(), []);
  assert.deepEqual(
    await (await call(`${events}/${event.id}`, a)).json(),
    event,
  );
  assert.equal(
    (await call(`groups/${g2.id}/events/${event.id}`, a)).status,
    404,
  );
  for (const [path, method, body] of [
    [`groups/${g1.id}`, "GET", undefined],
    [`groups/${g1.id}`, "PATCH", { name: "침입" }],
    [events, "GET", undefined],
    [events, "POST", { name: "침입" }],
    [`${events}/${event.id}`, "GET", undefined],
  ] as const)
    assert.equal((await call(path, b, method, body)).status, 404);
  assert.equal(
    (await call(`groups/${other.id}/events`, a, "POST", { name: "침입" }))
      .status,
    404,
  );
  assert.equal(
    (await call(events, a, "POST", { name: "침입", groupId: other.id })).status,
    400,
  );
  assert.equal(
    (
      await call(events, a, "POST", {
        name: "날짜 오류",
        scheduledAt: "2026-02-30T10:00:00+09:00",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(events, a, "POST", {
        name: "시간대 없음",
        scheduledAt: "2026-11-03T10:00:00",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(events, a, "POST", {
        name: "일정 행사",
        scheduledAt: "2026-11-03T10:00:00+09:00",
      })
    ).status,
    201,
  );
  const rename = await call(`groups/${g1.id}`, a, "PATCH", {
    name: "수정 모임",
  });
  assert.deepEqual(await rename.json(), { id: g1.id, name: "수정 모임" });
  assert.equal((await call(`groups/not-a-uuid`, a)).status, 400);
  assert.equal((await call("auth/logout", a, "POST")).status, 204);
  assert.equal((await call(events, a)).status, 401);
});

test("additive migration preserves existing account, session and refresh data", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app } = await startTestApplication(process.env.TEST_DATABASE_URL);
  t.after(() => app.close());
  const db = await app.get(DatabaseService).connect();
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    // A fresh transaction-local schema exercises the real migration SQL without
    // reverting migrations or modifying any existing account in the test DB.
    const schema = `upgrade_${randomUUID().replaceAll("-", "")}`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET LOCAL search_path TO ${schema}`);
    const { Authentication1793318400000 } =
      await import("../../src/database/migrations/1793318400000-Authentication.js");
    const { GroupEvents1793664000000 } =
      await import("../../src/database/migrations/1793664000000-GroupEvents.js");
    await new Authentication1793318400000().up(runner);
    const account = randomUUID(),
      session = randomUUID();
    await runner.query("INSERT INTO accounts VALUES ($1, $2, $3, now())", [
      account,
      "existing@example.com",
      "existing-hash",
    ]);
    await runner.query(
      "INSERT INTO auth_sessions VALUES ($1, $2, now() + interval '1 day', null)",
      [session, account],
    );
    await runner.query("INSERT INTO refresh_tokens VALUES ($1, $2, null)", [
      "a".repeat(64),
      session,
    ]);
    const before = await runner.query(
      "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
    );
    await new GroupEvents1793664000000().up(runner);
    assert.deepEqual(
      await runner.query(
        "SELECT row_to_json(a) AS account, row_to_json(s) AS session, row_to_json(r) AS refresh FROM accounts a, auth_sessions s, refresh_tokens r",
      ),
      before,
    );
    const group = randomUUID();
    await runner.query("INSERT INTO groups VALUES ($1, $2, $3, now())", [
      group,
      account,
      "기존 계정 모임",
    ]);
    await runner.query("INSERT INTO events VALUES ($1, $2, $3, null, now())", [
      randomUUID(),
      group,
      "명단 없는 행사",
    ]);
    assert.equal(
      (await runner.query("SELECT count(*)::int AS count FROM events"))[0]
        .count,
      1,
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
});
