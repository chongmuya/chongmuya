import { signupFixture } from "./signup-fixture.js";
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { startTestApplication } from "./test-application.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";

export async function startResourceApplication(
  t: TestContext,
  environment: NodeJS.ProcessEnv = {},
) {
  assert(
    process.env.TEST_DATABASE_URL,
    "TEST_DATABASE_URL must point to an isolated test database",
  );
  const result = await startTestApplication(
    process.env.TEST_DATABASE_URL,
    true,
    environment,
  );
  t.after(() => result.app.close());
  const db = await result.app.get(DatabaseService).connect();
  await db.runMigrations();
  // Suites run serially; clear only this isolated client's rate-limit row.
  await db
    .getRepository(AuthAttempt)
    .delete({ key: tokenHash("ip:127.0.0.1") });
  const call = (path: string, jar = "", method = "GET", body?: unknown) =>
    fetch(`${result.url}/api/v1/${path}`, {
      method,
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Protection": "1",
        "Content-Type": "application/json",
        Cookie: jar,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const signup = async () => {
    const fixture = await signupFixture(db);
    const response = await call("auth/signup", fixture.jar, "POST", {
      ...fixture.body,
      password: "group-events-123",
    });
    assert.equal(response.status, 201);
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  };
  const createGroup = async (name: string, jar: string) => {
    const response = await call("groups", jar, "POST", { name });
    assert.equal(response.status, 201);
    return (await response.json()) as { id: string; name: string };
  };
  return { ...result, db, call, signup, createGroup };
}
