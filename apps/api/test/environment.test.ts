import {
  parseDatabaseEnvironment,
  developmentDatabaseEnvironmentSchema,
  parseDeploymentDatabase,
  validateDeploymentDatabasePair,
} from "../src/config/database-environment.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  environmentVariableNames,
  parseEnvironment as parse,
} from "../src/config/environment.js";

test("Turbo forwards every API runtime setting without exposing it to the web task", () => {
  const { tasks } = JSON.parse(
    readFileSync(new URL("../../../../turbo.json", import.meta.url), "utf8"),
  ) as { tasks: Record<string, { passThroughEnv?: string[] }> };
  const api = new Set(tasks["@chongmuya/api#dev"]!.passThroughEnv);
  for (const name of environmentVariableNames) {
    assert(api.has(name), `API dev drops ${name}`);
    assert(
      !(tasks.dev!.passThroughEnv ?? []).includes(name) || name === "NODE_ENV",
      `API setting leaked to the shared dev task: ${name}`,
    );
  }
});

const authSecret = "test-secret-with-at-least-32-characters";
test("development seed/reset allows only the named loopback development or isolated test DB", () => {
  for (const [NODE_ENV, DATABASE_URL] of [
    ["development", "postgresql://chongmuya:fake@127.0.0.1:15432/chongmuya"],
    ["test", "postgresql://chongmuya:fake@localhost:25436/chongmuya_test_seed"],
  ])
    assert(
      developmentDatabaseEnvironmentSchema.safeParse({ NODE_ENV, DATABASE_URL })
        .success,
    );
  for (const [NODE_ENV, DATABASE_URL] of [
    ["production", "postgresql://chongmuya:fake@127.0.0.1:15432/chongmuya"],
    ["development", "postgresql://chongmuya:fake@127.0.0.1:5432/chongmuya"],
    [
      "development",
      "postgresql://chongmuya_app:fake@localhost:15432/chongmuya",
    ],
    [
      "development",
      "postgresql://chongmuya:fake@remote.example.test:15432/chongmuya",
    ],
    ["test", "postgresql://chongmuya:fake@localhost:15432/chongmuya"],
    ["test", "postgresql://chongmuya:fake@localhost:25436/production"],
    [
      "test",
      "postgresql://chongmuya:fake@localhost:25436/chongmuya_test?host=remote",
    ],
  ])
    assert(
      !developmentDatabaseEnvironmentSchema.safeParse({
        NODE_ENV,
        DATABASE_URL,
      }).success,
    );
});
const webOrigin = "http://localhost:3000";
const parseEnvironment = (env: NodeJS.ProcessEnv) =>
  parse({ AUTH_SECRET: authSecret, WEB_ORIGIN: webOrigin, ...env });

const productionProviders = {
  MESSAGE_PROVIDER: "solapi",
  SOLAPI_API_KEY: "test-key",
  SOLAPI_API_SECRET: "test-secret",
  SOLAPI_SENDER_NUMBER: "0299999999",
  SOLAPI_WEBHOOK_SECRET: "test-webhook-secret-1234",
  GEOCODING_PROVIDER: "naver",
  NAVER_MAP_CLIENT_ID: "test-client",
  NAVER_MAP_CLIENT_SECRET: "test-secret",
  OWNER_SUPPORT_EMAIL: "owner@example.test",
  MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
};

const databaseUrl = "postgresql://local:local@127.0.0.1:15432/chongmuya";

test("configuration rejects missing/invalid required values without exposing values", () => {
  for (const env of [
    {},
    { DATABASE_URL: databaseUrl, AUTH_SECRET: "short" },
    { DATABASE_URL: databaseUrl, AUTH_SECRET: undefined },
    { DATABASE_URL: databaseUrl, WEB_ORIGIN: "not-a-url" },
    {
      DATABASE_URL: databaseUrl,
      ...productionProviders,
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
    { DATABASE_URL: databaseUrl, OCTOMO_API_KEY: "" },
    { DATABASE_URL: databaseUrl, OCTOMO_API_KEY: "private-password bad" },
    { DATABASE_URL: databaseUrl, KAKAO_ADMIN_KEY: "private-password bad" },
    { DATABASE_URL: databaseUrl, SIGNUP_TERMS_JSON: "private-password" },
    { DATABASE_URL: databaseUrl, SIGNUP_TERMS_JSON: "[]" },
    { DATABASE_URL: databaseUrl, FILES_MAX_BYTES: "1" },
    { DATABASE_URL: databaseUrl, FILES_MAX_COUNT: "0" },
    { DATABASE_URL: databaseUrl, FILES_S3_BUCKET: "private-password invalid" },
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
      ...productionProviders,
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
      remindersEnabled: false,
      filesBucket: undefined,
      filesRegion: "ap-northeast-2",
      filesMaxCount: 100,
      filesMaxBytes: 524288000,
      trustProxyHops: 0,
      messageProvider: "fake",
      solapiApiKey: undefined,
      solapiApiSecret: undefined,
      solapiSenderNumber: undefined,
      solapiWebhookSecret: undefined,
      geocodingProvider: "fake",
      naverMapClientId: undefined,
      naverMapClientSecret: undefined,
      ownerSupportEmail: undefined,
      merchantReplyTokenEncryptionKey: undefined,
      providerTimeoutMs: 5000,
      merchantReplyTtlHours: 168,
      reservationManagementTtlHours: 168,
      authSecret,
      kakaoAdminKey: undefined,
      kakaoClientId: undefined,
      kakaoClientSecret: undefined,
      kakaoRedirectUri: undefined,
      resendApiKey: undefined,
      resendFrom: undefined,
      resendReplyTo: "support@chongmuya.com",
      emailVerificationSecret: undefined,
      octomoApiKey: undefined,
      signupTerms: undefined,
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
      ...productionProviders,
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

test("proxy trust defaults to zero in every environment and accepts only explicit hop counts", () => {
  for (const nodeEnv of ["development", "test", "production"]) {
    const base = {
      DATABASE_URL: databaseUrl,
      ...productionProviders,
      NODE_ENV: nodeEnv,
      WEB_ORIGIN: "https://example.test",
    };
    assert.equal(parseEnvironment(base).trustProxyHops, 0);
    for (const hops of ["0", "1"])
      assert.equal(
        parseEnvironment({ ...base, TRUST_PROXY_HOPS: hops }).trustProxyHops,
        Number(hops),
      );
  }
  for (const invalid of [
    "",
    "true",
    "false",
    "-1",
    "2",
    "1.0",
    "0.5",
    "01",
    " 1",
    "1 ",
    "private-value",
  ])
    assert.throws(
      () =>
        parseEnvironment({
          DATABASE_URL: databaseUrl,
          TRUST_PROXY_HOPS: invalid,
        }),
      { message: "Invalid environment variables: TRUST_PROXY_HOPS" },
    );
  assert.equal(
    parseEnvironment({ DATABASE_URL: databaseUrl, TRUSTED_PROXY_CIDRS: "" })
      .trustProxyHops,
    0,
  );
  for (const hops of [undefined, "0", "1"])
    assert.throws(
      () =>
        parseEnvironment({
          DATABASE_URL: databaseUrl,
          TRUST_PROXY_HOPS: hops,
          TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
        }),
      { message: "Invalid environment variables: TRUSTED_PROXY_CIDRS" },
    );
});

test("real server refuses to start with invalid configuration", () => {
  for (const overrides of [
    { DATABASE_URL: "" },
    { API_PORT: "bad-port" },
    { API_DOCS_ENABLED: "not-a-boolean" },
    { TRUSTED_PROXY_CIDRS: "private-legacy-value", TRUST_PROXY_HOPS: "1" },
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.resolve(import.meta.dirname, "../src/main.js")],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL: databaseUrl,
          AUTH_SECRET: authSecret,
          WEB_ORIGIN: webOrigin,
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
    if (overrides.TRUSTED_PROXY_CIDRS) {
      assert.match(result.stdout + result.stderr, /TRUSTED_PROXY_CIDRS/);
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /private-legacy-value/,
      );
    }
  }
});

test("email configuration is all-or-none, validates sender and never exposes secrets", () => {
  const valid = {
    DATABASE_URL: databaseUrl,
    RESEND_API_KEY: "re_private-password",
    RESEND_FROM: "총무야 <hello@example.com>",
    EMAIL_VERIFICATION_SECRET: "s".repeat(32),
  };
  assert.equal(parseEnvironment(valid).resendFrom, valid.RESEND_FROM);
  assert.equal(
    parseEnvironment({ ...valid, RESEND_REPLY_TO: "help@example.com" })
      .resendReplyTo,
    "help@example.com",
  );
  for (const overrides of [
    { RESEND_FROM: undefined },
    { RESEND_REPLY_TO: "private-password" },
    { EMAIL_VERIFICATION_SECRET: "private-password" },
    { RESEND_FROM: "hello@example.com>" },
    { RESEND_FROM: "Name <hello@example.com" },
    { RESEND_FROM: "bad\nName <hello@example.com>" },
    { RESEND_DEBUG: "true" },
    { RESEND_API_KEY: "private-password whitespace" },
  ])
    assert.throws(
      () => parseEnvironment({ ...valid, ...overrides }),
      (error: unknown) =>
        error instanceof Error && !error.message.includes("private-password"),
    );
});

test("Kakao configuration is optional together and callback is an explicit trusted API URL, separate from the web origin", () => {
  const base = {
    DATABASE_URL: "postgresql://test@localhost/test",
    AUTH_SECRET: "s".repeat(32),
    WEB_ORIGIN: "http://localhost:3000",
  };
  assert.equal(parseEnvironment(base).kakaoClientId, undefined);
  const kakao = {
    KAKAO_CLIENT_ID: "test-client",
    KAKAO_CLIENT_SECRET: "private-test-secret",
    KAKAO_REDIRECT_URI: "http://localhost:3001/api/v1/auth/kakao/callback",
  };
  assert.equal(
    parseEnvironment({ ...base, ...kakao }).kakaoRedirectUri,
    kakao.KAKAO_REDIRECT_URI,
  );
  assert.equal(
    parseEnvironment({
      ...base,
      ...kakao,
      ...productionProviders,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://chongmuya.com",
      KAKAO_REDIRECT_URI:
        "https://api.chongmuya.com/api/v1/auth/kakao/callback",
    }).kakaoRedirectUri,
    "https://api.chongmuya.com/api/v1/auth/kakao/callback",
  );
  for (const change of [
    { KAKAO_CLIENT_SECRET: undefined },
    {
      KAKAO_REDIRECT_URI:
        "https://name:secret@api.example.com/api/v1/auth/kakao/callback",
    },
    { KAKAO_REDIRECT_URI: "https://evil.example/callback" },
    { KAKAO_REDIRECT_URI: kakao.KAKAO_REDIRECT_URI + "?next=evil" },
    { KAKAO_REDIRECT_URI: kakao.KAKAO_REDIRECT_URI + "#hash" },
    { NODE_ENV: "production", WEB_ORIGIN: "https://chongmuya.com" },
  ])
    assert.throws(
      () => parseEnvironment({ ...base, ...kakao, ...change }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("KAKAO_") &&
        !error.message.includes("private-test-secret") &&
        !error.message.includes("evil"),
    );
});

test("DB CLI configuration ignores external providers; runtime validates activated adapters", () => {
  const fake = parseEnvironment({
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: "s".repeat(32),
    MESSAGE_PROVIDER: "fake",
    GEOCODING_PROVIDER: "fake",
    SOLAPI_API_KEY: "",
    SOLAPI_API_SECRET: "",
    SOLAPI_SENDER_NUMBER: "invalid",
    SOLAPI_WEBHOOK_SECRET: "",
    NAVER_MAP_CLIENT_ID: "",
    NAVER_MAP_CLIENT_SECRET: "",
  });
  assert.equal(fake.messageProvider, "fake");
  assert.equal(fake.geocodingProvider, "fake");

  assert.deepEqual(
    parseDatabaseEnvironment({
      DATABASE_URL: databaseUrl,
      SOLAPI_SENDER_NUMBER: "invalid",
      GEOCODING_PROVIDER: "naver",
      AUTH_SECRET: "short",
    }),
    { databaseUrl },
  );
  for (const extra of [
    { MESSAGE_PROVIDER: "solapi" },
    { GEOCODING_PROVIDER: "naver" },
    {
      ...productionProviders,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://example.test",
      MESSAGE_PROVIDER: "fake",
    },
    {
      ...productionProviders,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://example.test",
      GEOCODING_PROVIDER: "fake",
    },
  ])
    assert.throws(
      () => parseEnvironment({ DATABASE_URL: databaseUrl, ...extra }),
      /Invalid environment variables/,
    );
});

test("compiled migration DataSource loads with only DATABASE_URL despite invalid unrelated configuration", () => {
  const file = new URL("../src/database/data-source.js", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const {default: source} = await import(${JSON.stringify(file)});
       const assert = (await import('node:assert/strict')).default;
       assert.equal(source.options.extra.statement_timeout, 60000);
       assert.equal(source.options.extra.lock_timeout, 5000);
       assert.equal(source.options.migrationsRun, false);`,
    ],
    {
      env: {
        DATABASE_URL: databaseUrl,
        SOLAPI_SENDER_NUMBER: "bad",
        GEOCODING_PROVIDER: "naver",
      },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("deployment requires distinct app/migrator users on the same TLS database", () => {
  const app =
    "postgresql://chongmuya_app:DO_NOT_LOG@chongmuya-prod.cp6awyiq6zpo.ap-northeast-2.rds.amazonaws.com:5432/chongmuya?sslmode=verify-full&sslrootcert=/run/certs/rds-global-bundle.pem";
  const migrator = app.replace("chongmuya_app", "chongmuya_migrator");
  assert.doesNotThrow(() => validateDeploymentDatabasePair(app, migrator));
  for (const [runtime, migration] of [
    [app, app],
    [migrator, app],
    [app, migrator.replace("chongmuya-prod.", "other.")],
    [app.replace("verify-full", "require"), migrator],
    [app.replace("chongmuya_app", "chongmuyaadmin"), migrator],
  ])
    assert.throws(() => validateDeploymentDatabasePair(runtime, migration), {
      message: "Invalid environment variables: DATABASE_URL",
    });
  assert.equal(parseDeploymentDatabase(app, "app").database, "chongmuya");
});
