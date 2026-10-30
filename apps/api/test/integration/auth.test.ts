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
  const signup = await post("signup", "", credentials);
  assert.equal(signup.status, 201);
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
