// Run after building chongmuya-api:deployment-test. Uses disposable Docker resources only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyDeploymentFlow } from "./test-deployment-flow.mjs";

const image = "chongmuya-api:deployment-test";
const host = "chongmuya-prod.cp6awyiq6zpo.ap-northeast-2.rds.amazonaws.com";
const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: "utf8", timeout: 180000, ...options });
const ok = (result) => {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test("production image preserves raw configuration, verifies TLS, migrates twice and shuts down", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "chongmuya-deployment-"));
  const name = `chongmuya-deployment-${process.pid}`;
  const certificate = join(directory, "server.crt");
  const key = join(directory, "server.key");
  const wrongCa = join(directory, "wrong.crt");
  ok(
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      certificate,
      "-days",
      "1",
      "-subj",
      `/CN=${host}`,
      "-addext",
      `subjectAltName=DNS:${host}`,
    ]),
  );
  ok(
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(directory, "wrong.key"),
      "-out",
      wrongCa,
      "-days",
      "1",
      "-subj",
      "/CN=wrong.test",
    ]),
  );
  chmodSync(certificate, 0o644);
  chmodSync(wrongCa, 0o644);
  ok(run("docker", ["network", "create", name]));
  const compose = [
    "compose",
    "-p",
    name,
    "--env-file",
    join(directory, "compose.env"),
    "-f",
    resolve("infra/compose.prod.yml"),
    "-f",
    join(directory, "override.yml"),
  ];
  t.after(() => {
    run("docker", [...compose, "down", "--remove-orphans"]);
    run("docker", ["rm", "-f", name]);
    run("docker", ["network", "rm", name]);
    rmSync(directory, { recursive: true, force: true });
  });
  ok(
    run("docker", [
      "run",
      "-d",
      "--name",
      name,
      "--network",
      name,
      "--network-alias",
      host,
      "--network-alias",
      "wrong.test",
      "-e",
      "POSTGRES_PASSWORD=local-test-only",
      "-e",
      "POSTGRES_DB=chongmuya",
      "-v",
      `${directory}:/certs:ro`,
      "--entrypoint",
      "sh",
      "postgres:17.11-alpine",
      "-c",
      "mkdir /tmp/tls && cp /certs/server.* /tmp/tls/ && chown postgres:postgres /tmp/tls/* && chmod 600 /tmp/tls/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/tls/server.crt -c ssl_key_file=/tmp/tls/server.key",
    ]),
  );
  for (let i = 0; i < 60; i++) {
    if (
      run("docker", ["exec", name, "pg_isready", "-U", "postgres"]).status === 0
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const sql = (query, user = "postgres") =>
    ok(
      run(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          user,
          "-d",
          "chongmuya",
          "-At",
        ],
        { input: query },
      ),
    ).trim();
  sql(readFileSync(resolve("infra/database-bootstrap.sql"), "utf8"));
  sql(
    "ALTER ROLE chongmuya_app PASSWORD 'app-test-only'; ALTER ROLE chongmuya_migrator PASSWORD 'migrator-test-only'",
  );
  const databaseUrl = `postgresql://chongmuya_app:app-test-only@${host}:5432/chongmuya?sslmode=verify-full&sslrootcert=/run/certs/rds-global-bundle.pem`;
  const migrationUrl = databaseUrl.replace(
    "chongmuya_app:app-test-only",
    "chongmuya_migrator:migrator-test-only",
  );
  const migrationPayload = {
    Parameter: {
      Name: "/chongmuya/deploy/prod/DATABASE_URL",
      Value: migrationUrl,
    },
  };
  writeFileSync(
    join(directory, "migration.json"),
    JSON.stringify(migrationPayload),
  );
  const env = {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    WEB_ORIGIN: "https://chongmuya.com",
    API_PORT: "3001",
    API_DOCS_ENABLED: "false",
    TRUST_PROXY_HOPS: "1",
    MESSAGE_PROVIDER: "solapi",
    GEOCODING_PROVIDER: "naver",
    AUTH_SECRET: 'test "secret" $value # literal with spaces 1234567890',
    SOLAPI_API_KEY: "test-key",
    SOLAPI_API_SECRET: "test-secret",
    SOLAPI_SENDER_NUMBER: "01000000000",
    SOLAPI_WEBHOOK_SECRET: "test-webhook-secret-123456",
    NAVER_MAP_CLIENT_ID: "test-id",
    NAVER_MAP_CLIENT_SECRET: "test-secret",
    MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    OWNER_SUPPORT_EMAIL: "owner@example.test",
    RESEND_API_KEY: "test-key",
    RESEND_FROM: '총무 "Team" $literal # 안내 <sender@example.test>',
    EMAIL_VERIFICATION_SECRET: "test-email-secret-12345678901234567890",
    SIGNUP_TERMS_JSON: JSON.stringify(
      ["serviceTerms", "privacyCollection", "privacyPolicy", "marketing"].map(
        (id) => ({
          id,
          version: "test",
          url: `https://example.test/${id}?x=$value#section`,
        }),
      ),
    ),
  };
  const payload = {
    Parameters: Object.entries(env).map(([Name, Value]) => ({
      Name: `/chongmuya/prod/${Name}`,
      Value,
    })),
  };
  const prepare = [
    "run",
    "--rm",
    "-i",
    "--platform",
    "linux/amd64",
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "-v",
    `${directory}:/release`,
    "-v",
    `${certificate}:/run/certs/rds-global-bundle.pem:ro`,
    image,
    "node",
    "scripts/deployment-config.mjs",
    "prepare",
    "/release",
    "/release/migration.json",
  ];
  const invalidPayload = structuredClone(payload);
  invalidPayload.Parameters.find((p) => p.Name.endsWith("/AUTH_SECRET")).Value =
    "DO_NOT_LOG_THIS";
  const invalid = run("docker", prepare, {
    input: JSON.stringify(invalidPayload),
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /AUTH_SECRET/);
  assert.doesNotMatch(
    invalid.stderr + invalid.stdout,
    /DO_NOT_LOG_THIS|postgresql:/,
  );
  ok(run("docker", prepare, { input: JSON.stringify(payload) }));
  assert.equal(
    readFileSync(join(directory, "db.env"), "utf8"),
    `DATABASE_URL=${migrationUrl}\n`,
  );
  writeFileSync(
    join(directory, "compose.env"),
    `API_IMAGE=${image}\nAPI_ENV_FILE=${directory}/api.env\nTOOLS_ENV_FILE=${directory}/db.env\nRDS_CA_FILE=${certificate}\n`,
  );
  writeFileSync(
    join(directory, "override.yml"),
    `services:\n  api:\n    ports: !reset []\nnetworks:\n  default:\n    external: true\n    name: ${name}\n`,
  );
  ok(run("docker", [...compose, "config", "--quiet"]));
  ok(
    run("docker", [
      ...compose,
      "run",
      "--rm",
      "--no-deps",
      "api",
      "node",
      "scripts/deployment-config.mjs",
      "check",
    ]),
  );
  writeFileSync(join(directory, "expected.json"), JSON.stringify(env));
  chmodSync(join(directory, "expected.json"), 0o644);
  ok(
    run("docker", [
      ...compose,
      "run",
      "--rm",
      "--no-deps",
      "-v",
      `${directory}/expected.json:/expected.json:ro`,
      "api",
      "node",
      "--input-type=module",
      "-e",
      "import fs from 'node:fs';import assert from 'node:assert/strict';for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync('/expected.json'))))assert.equal(process.env[k],v,k);assert.notEqual(process.getuid(),0)",
    ]),
  );
  const toolCompose = [
    "compose",
    "-p",
    name,
    "--env-file",
    join(directory, "compose.env"),
    "-f",
    resolve("infra/compose.tools.yml"),
    "-f",
    join(directory, "tools-override.yml"),
  ];
  writeFileSync(
    join(directory, "tools-override.yml"),
    `networks:\n  default:\n    external: true\n    name: ${name}\n`,
  );
  const seed = (...args) =>
    run("docker", [
      ...toolCompose,
      "run",
      "--rm",
      "--no-deps",
      "seed-restaurants",
      "node",
      "dist/database/seeds/run-production-restaurants.js",
      ...args,
    ]);
  assert.notEqual(seed().status, 0, "seed must reject pending migrations");
  assert.equal(
    sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"),
    "0",
    "pending check must not create migration history",
  );
  ok(run("docker", [...toolCompose, "run", "--rm", "--no-deps", "migrate"]));
  assert.match(
    ok(run("docker", [...toolCompose, "run", "--rm", "--no-deps", "migrate"])),
    /"appliedCount":0/,
  );
  assert.equal(
    sql("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public'"),
    "chongmuya_migrator",
  );
  assert.notEqual(
    run("docker", [
      "exec",
      name,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "chongmuya_app",
      "-d",
      "chongmuya",
      "-c",
      "CREATE TABLE forbidden(id int)",
    ]).status,
    0,
  );
  assert.notEqual(
    run("docker", [
      "exec",
      name,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "chongmuya_app",
      "-d",
      "chongmuya",
      "-c",
      "ALTER TABLE accounts ADD COLUMN forbidden int",
    ]).status,
    0,
  );
  sql(
    "CREATE TABLE default_grant_probe (id serial primary key, value text)",
    "chongmuya_migrator",
  );
  assert.equal(
    sql(
      "INSERT INTO default_grant_probe(value) VALUES ('ok') RETURNING id",
      "chongmuya_app",
    ).split("\n")[0],
    "1",
  );
  sql(
    "UPDATE default_grant_probe SET value='updated'; DELETE FROM default_grant_probe",
    "chongmuya_app",
  );
  sql("DROP TABLE default_grant_probe", "chongmuya_migrator");
  // Production seed needs DML only and uses a freshly loaded app URL, never master.
  writeFileSync(join(directory, "db.env"), `DATABASE_URL=${databaseUrl}\n`, {
    mode: 0o600,
  });
  const fixture = JSON.parse(
    readFileSync(
      resolve("apps/api/src/database/seeds/data/restaurants.json"),
      "utf8",
    ),
  );
  const preview = JSON.parse(ok(seed()));
  assert.equal(preview.mode, "DRY_RUN");
  assert.equal(preview.restaurants.created, fixture.restaurants.length);
  assert.equal(sql("SELECT count(*) FROM restaurants"), "0");
  const inserted = JSON.parse(ok(seed("--execute")));
  assert.equal(
    inserted.menus.created,
    fixture.restaurants.reduce((n, r) => n + r.menus.length, 0),
  );
  assert.equal(
    sql(
      "SELECT (SELECT count(*) FROM accounts)+(SELECT count(*) FROM restaurant_contacts)+(SELECT count(*) FROM restaurants WHERE is_demo)",
    ),
    "0",
  );
  sql(
    "UPDATE restaurants SET name=name||' 수정', published=false WHERE id=(SELECT id FROM restaurants ORDER BY id LIMIT 1); UPDATE restaurant_spaces SET capacity=13, availability='UNAVAILABLE'; UPDATE restaurant_menus SET price=12345, available=false",
  );
  const fingerprint = () =>
    ["restaurants", "restaurant_spaces", "restaurant_menus"].map((table) =>
      sql(
        `SELECT md5(string_agg(row_to_json(r)::text,',' ORDER BY id)) FROM ${table} r`,
      ),
    );
  const before = fingerprint();
  assert.equal(JSON.parse(ok(seed())).restaurants.created, 0);
  assert.deepEqual(fingerprint(), before);
  assert.equal(JSON.parse(ok(seed("--execute"))).restaurants.created, 0);
  assert.deepEqual(fingerprint(), before);
  ok(
    run("docker", [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      image,
      "node",
      "--input-type=module",
      "-e",
      "import fs from 'node:fs';import assert from 'node:assert/strict';assert.notEqual(process.getuid(),0);assert.equal(JSON.parse(fs.readFileSync('package.json')).type,'module');assert(fs.existsSync('dist/database/seeds/data/restaurants.json'));assert(fs.existsSync('dist/database/seeds/run-production-restaurants.js'));for(const name of ['demo.seed.js','run-demo.js','restaurants-demo.seed.js','demo-scenarios.seed.js'])assert(!fs.existsSync('dist/database/seeds/'+name));await import('pg');await import('typeorm');await assert.rejects(import('typescript'),{code:'ERR_MODULE_NOT_FOUND'})",
    ]),
  );
  ok(
    run("docker", [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      image,
      "node",
      "scripts/merchant-operations.mjs",
      "--help",
    ]),
  );

  const connect =
    "import pg from 'pg';const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});try{await c.connect();await c.query('select 1');await c.end()}catch{process.exit(1)}";
  for (const [url, ca] of [
    [databaseUrl.replace(host, "wrong.test"), certificate],
    [databaseUrl, wrongCa],
  ]) {
    const result = run("docker", [
      "run",
      "--rm",
      "--network",
      name,
      "--platform",
      "linux/amd64",
      "-e",
      `DATABASE_URL=${url}`,
      "-v",
      `${ca}:/run/certs/rds-global-bundle.pem:ro`,
      image,
      "node",
      "--input-type=module",
      "-e",
      connect,
    ]);
    assert.equal(result.status, 1, "wrong host/CA must reject TLS");
  }
  rmSync(join(directory, "db.env"));
  ok(run("docker", [...compose, "config", "--quiet"])); // No absent migration env dependency.
  ok(
    run("docker", [
      ...compose,
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "60",
      "api",
    ]),
  );
  const apiId = ok(run("docker", [...compose, "ps", "-q", "api"])).trim();
  ok(run("docker", [...compose, "stop", "api"]));
  assert.equal(
    ok(run("docker", ["inspect", "-f", "{{.State.ExitCode}}", apiId])).trim(),
    "0",
  );
  // A wrong DB hostname makes the real readiness check fail with a nonzero Compose result.
  writeFileSync(
    join(directory, "api.env"),
    readFileSync(join(directory, "api.env"), "utf8").replace(
      host,
      "wrong.test",
    ),
  );
  const badReady = run("docker", [
    ...compose,
    "up",
    "-d",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "12",
    "api",
  ]);
  if (badReady.status === 0) {
    const running = ok(run("docker", [...compose, "ps", "-q", "api"])).trim();
    console.log(
      ok(
        run("docker", [
          "exec",
          running,
          "node",
          "--input-type=module",
          "-e",
          "console.log(new URL(process.env.DATABASE_URL).hostname);console.log((await fetch('http://127.0.0.1:3001/ready')).status)",
        ]),
      ),
    );
  }
  assert.notEqual(
    badReady.status,
    0,
    "bad TLS hostname must fail API readiness",
  );
  ok(run("docker", [...compose, "down", "--remove-orphans"]));
  await verifyDeploymentFlow({
    directory,
    name,
    certificate,
    image,
    payload,
    migrationPayload,
    run,
    ok,
    t,
  });
});

test("Nginx bootstrap and HTTPS configs load without logging callback query secrets", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "chongmuya-nginx-"));
  const name = `chongmuya-nginx-${process.pid}`;
  const certificate = join(directory, "server.crt");
  const key = join(directory, "server.key");
  t.after(() => {
    run("docker", ["rm", "-f", name]);
    rmSync(directory, { recursive: true, force: true });
  });
  ok(
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      certificate,
      "-days",
      "1",
      "-subj",
      "/CN=api.chongmuya.com",
    ]),
  );
  ok(
    run("docker", [
      "run",
      "--rm",
      "-v",
      `${resolve("infra/nginx/api.conf")}:/etc/nginx/conf.d/default.conf:ro`,
      "nginx:stable-alpine",
      "nginx",
      "-t",
    ]),
  );
  // Simulate Certbot's host-owned TLS additions; Git supplies HTTP/proxy only.
  writeFileSync(
    join(directory, "https.conf"),
    readFileSync(resolve("infra/nginx/api.conf"), "utf8").replace(
      "listen 80;",
      "listen 443 ssl;\n    ssl_certificate /etc/letsencrypt/live/api.chongmuya.com/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/api.chongmuya.com/privkey.pem;",
    ),
  );
  ok(
    run("docker", [
      "run",
      "-d",
      "--name",
      name,
      "-p",
      "127.0.0.1::443",
      "-v",
      `${join(directory, "https.conf")}:/etc/nginx/conf.d/default.conf:ro`,
      "-v",
      `${certificate}:/etc/letsencrypt/live/api.chongmuya.com/fullchain.pem:ro`,
      "-v",
      `${key}:/etc/letsencrypt/live/api.chongmuya.com/privkey.pem:ro`,
      "nginx:stable-alpine",
    ]),
  );
  ok(run("docker", ["exec", name, "nginx", "-t"]));
  const port = ok(run("docker", ["port", name, "443/tcp"]))
    .trim()
    .split(":")
    .at(-1);
  let response;
  for (let i = 0; i < 20; i++) {
    response = run("curl", [
      "--silent",
      "--insecure",
      "--noproxy",
      "*",
      "--resolve",
      `api.chongmuya.com:${port}:127.0.0.1`,
      "--output",
      "/dev/null",
      "--write-out",
      "%{http_code}",
      `https://api.chongmuya.com:${port}/api/v1/auth/kakao/callback?code=NEVER_LOG_CODE&state=NEVER_LOG_STATE`,
    ]);
    if (response.status === 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(ok(response), "502"); // No upstream; exercise Nginx's error path.
  const log = ok(
    run("docker", ["exec", name, "cat", "/var/log/nginx/api-access.log"]),
  );
  assert.match(log, /\/api\/v1\/auth\/kakao\/callback 502/);
  const containerLog = run("docker", ["logs", name]);
  assert.doesNotMatch(
    log + containerLog.stdout + containerLog.stderr,
    /NEVER_LOG_CODE|NEVER_LOG_STATE/,
  );
});
