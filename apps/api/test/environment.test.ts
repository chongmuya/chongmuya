import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { parseEnvironment as parse } from "../src/config/environment.js";

const authSecret = "test-secret-with-at-least-32-characters";
const webOrigin = "http://localhost:3000";
const parseEnvironment = (env: NodeJS.ProcessEnv) =>
  parse({ AUTH_SECRET: authSecret, WEB_ORIGIN: webOrigin, ...env });

const databaseUrl = "postgresql://local:local@127.0.0.1:15432/chongmuya";

test("configuration rejects missing/invalid required values without exposing values", () => {
  for (const env of [
    {},
    { DATABASE_URL: databaseUrl, AUTH_SECRET: "short" },
    { DATABASE_URL: databaseUrl, AUTH_SECRET: undefined },
    { DATABASE_URL: databaseUrl, WEB_ORIGIN: "not-a-url" },
    {
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      WEB_ORIGIN: "http://example.com",
    },
    { DATABASE_URL: "https://private-password@example.com/database" },
    { DATABASE_URL: databaseUrl, API_PORT: "3001oops" },
    { DATABASE_URL: databaseUrl, API_PORT: "65536" },
    { DATABASE_URL: databaseUrl, API_PORT: "0" },
    { DATABASE_URL: databaseUrl, API_PORT: "" },
    { DATABASE_URL: databaseUrl, API_PORT: "3e3" },
    { DATABASE_URL: databaseUrl, API_PORT: "3000.5" },
    { DATABASE_URL: "postgresql://localhost" },
    { DATABASE_URL: "private-password" },
    { DATABASE_URL: databaseUrl, NODE_ENV: "staging" },
    { DATABASE_URL: databaseUrl, API_DOCS_ENABLED: "yes" },
    { DATABASE_URL: databaseUrl, API_DOCS_ENABLED: "" },
  ]) {
    assert.throws(
      () => parseEnvironment(env),
      (error: unknown) =>
        error instanceof Error &&
        error.message.startsWith("Invalid environment variables:") &&
        !error.message.includes("private-password"),
    );
  }
  assert.equal(
    parseEnvironment({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://example.com",
    }).docsEnabled,
    false,
  );
  assert.deepEqual(
    parseEnvironment({
      DATABASE_URL: databaseUrl,
      UNRELATED_VARIABLE: "allowed",
    }),
    {
      authSecret,
      webOrigin,
      nodeEnv: "development",
      port: 3001,
      databaseUrl,
      docsEnabled: true,
    },
  );
  assert.equal(
    parseEnvironment({ DATABASE_URL: databaseUrl, API_DOCS_ENABLED: "false" })
      .docsEnabled,
    false,
  );
  assert.equal(
    parseEnvironment({
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://example.com",
      API_DOCS_ENABLED: "true",
    }).docsEnabled,
    true,
  );
  assert.equal(
    parseEnvironment({ DATABASE_URL: databaseUrl, API_PORT: "65535" }).port,
    65535,
  );
});

test("real server refuses to start with invalid configuration", () => {
  for (const overrides of [
    { DATABASE_URL: "" },
    { API_PORT: "bad-port" },
    { API_DOCS_ENABLED: "not-a-boolean" },
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.resolve(import.meta.dirname, "../src/main.js")],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: databaseUrl,
          ...overrides,
        },
        encoding: "utf8",
        timeout: 10_000,
      },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /Invalid environment variables/,
    );
    assert.doesNotMatch(result.stdout + result.stderr, /postgresql:\/\//);
  }
});
