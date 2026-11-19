import assert from "node:assert/strict";
import { createServer as createHttpServer, request } from "node:http";
import { createServer } from "node:net";
import { test } from "node:test";
import { startTestApplication } from "./support/test-application.js";

test("production HTTP setup preserves health, validation, errors, request IDs and OpenAPI", async (t) => {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const address = socket.address();
  assert(address && typeof address !== "string");
  const deadPort = address.port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  const { app, url, logs } = await startTestApplication(
    `postgresql://test:test@127.0.0.1:${deadPort}/test`,
  );
  t.after(() => app.close());

  const live = await fetch(`${url}/health`, {
    headers: {
      "x-request-id": "untrusted-value",
      Origin: "http://localhost:3000",
    },
  });
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), {
    status: "ok",
    service: "chongmuya-api",
  });
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.match(live.headers.get("x-request-id") ?? "", /^[\da-f-]{36}$/);
  assert.equal(live.headers.get("x-powered-by"), null);

  const assertCors = (response: Response) => {
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:3000",
    );
    assert.equal(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
    assert.match(
      response.headers.get("access-control-expose-headers") ?? "",
      /x-request-id/i,
    );
  };
  assertCors(live);
  const preflight = await fetch(`${url}/api/v1/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-csrf-protection",
    },
  });
  assert.equal(preflight.status, 204);
  assertCors(preflight);
  assert.match(
    preflight.headers.get("access-control-allow-headers") ?? "",
    /content-type/i,
  );
  assert.match(
    preflight.headers.get("access-control-allow-headers") ?? "",
    /x-csrf-protection/i,
  );
  for (const origin of [
    "http://localhost:3000.evil.test",
    "http://127.0.0.1:3000",
    "null",
  ]) {
    const denied = await fetch(`${url}/api/v1/auth/login`, {
      method: "POST",
      headers: { Origin: origin, "X-CSRF-Protection": "1" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const options = await fetch(`${url}/api/v1/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(options.headers.get("access-control-allow-origin"), null);
  }
  const csrf = await fetch(`${url}/api/v1/auth/login`, {
    method: "POST",
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(csrf.status, 403);
  assertCors(csrf);
  const oversized = await fetch(`${url}/api/v1/groups`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "X-CSRF-Protection": "1",
    },
    body: JSON.stringify({ name: "private-large-body".repeat(16000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).code, "PAYLOAD_TOO_LARGE");
  assertCors(oversized);
  assert.doesNotMatch(JSON.stringify(logs), /private-large-body/);

  for (const [endpoint, status, code] of [
    ["/ready", 503, "SERVICE_UNAVAILABLE"],
    ["/missing?token=private-query", 404, "NOT_FOUND"],
    ["/test/error", 500, "INTERNAL_SERVER_ERROR"],
    ["/test/limited", 429, "TOO_MANY_REQUESTS"],
    ["/api/v1/auth/me", 401, "SESSION_INVALID"],
  ] as const) {
    const response = await fetch(url + endpoint, {
      headers: { Origin: "http://localhost:3000" },
    });
    assertCors(response);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), [
      "code",
      "message",
      "requestId",
      "statusCode",
    ]);
    assert.equal(body.code, code);
    assert.equal(body.statusCode, status);
    assert.equal(body.requestId, response.headers.get("x-request-id"));
    assert.notEqual(body.requestId, live.headers.get("x-request-id"));
    assert.doesNotMatch(JSON.stringify(body), /private-|postgresql|stack/i);
  }
  const post = (body: string) =>
    fetch(`${url}/test/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        "X-CSRF-Protection": "1",
      },
      body,
    });
  const valid = await post(JSON.stringify({ name: "참석자", count: 1 }));
  assert.equal(valid.status, 201);
  assert.deepEqual(await valid.json(), { name: "참석자", count: 1 });
  for (const body of [
    '{"name":"참석자","count":"1"}',
    '{"name":"참석자","count":1,"role":"admin"}',
    '{"name":12,"count":0}',
    "{broken-json",
  ]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).code,
      body === "{broken-json" ? "BAD_REQUEST" : "VALIDATION_FAILED",
    );
  }
  await fetch(`${url}/test/secret/private-path?token=private-query`, {
    headers: { authorization: "private-header" },
  });
  assert(logs.some((entry) => entry.statusCode === 500));
  assert(logs.some((entry) => entry.route === "/test/secret/:token"));
  assert.doesNotMatch(JSON.stringify(logs), /private-/);
  const spec = await (await fetch(`${url}/docs-json`)).json();
  assert(spec.paths["/health"].get.responses["200"]);
  assert(spec.paths["/ready"].get.responses["503"]);
  assert(spec.components.schemas.ErrorResponseDto.properties.requestId);
  for (const path of [
    "/api/v1/groups",
    "/api/v1/groups/{groupId}",
    "/api/v1/events",
    "/api/v1/events/{eventId}",
  ])
    assert(spec.paths[path], `registered module route: ${path}`);
  assert(!spec.paths["/api/v1/groups/{groupId}/events"]);
  assert(!spec.paths["/api/v1/events/{eventId}/group"]);
  assert(spec.components.schemas.ErrorResponseDto.properties.fieldErrors);
  for (const name of [
    "GroupInput",
    "GroupDto",
    "EventInput",
    "EventDto",
    "CredentialsDto",
    "AccountDto",
    "SessionDto",
  ])
    assert(spec.components.schemas[name], `existing OpenAPI schema: ${name}`);
  assert.deepEqual(
    Object.keys(spec.components.schemas.EventDto.properties).sort(),
    [
      "groupId",
      "id",
      "name",
      "ownerId",
      "reservationScheduleLocked",
      "scheduledAt",
      "version",
    ],
  );
});

test("disabled OpenAPI routes are unavailable", async (t) => {
  const { app, url } = await startTestApplication(
    "postgresql://test:test@127.0.0.1:1/test",
    false,
  );
  t.after(() => app.close());
  assert.equal((await fetch(`${url}/docs-json`)).status, 404);
  assert.equal((await fetch(`${url}/health`)).status, 200);
});

test("zero hops uses the socket IP and one hop uses only the nearest forwarded IP", async (t) => {
  for (const [hops, expected] of [
    ["0", "127.0.0.1"],
    ["1", "203.0.113.5"],
  ]) {
    const { app, url } = await startTestApplication(
      "postgresql://test@127.0.0.1:1/test",
      false,
      { TRUST_PROXY_HOPS: hops },
    );
    t.after(() => app.close());
    const r = await fetch(`${url}/test/ip`, {
      headers: { "X-Forwarded-For": "198.51.100.99, 203.0.113.5" },
    });
    assert.equal((await r.json()).ip, expected);
  }
});

test("a single local HTTP proxy overwrites forwarded IP, host and protocol", async (t) => {
  const { app, url } = await startTestApplication(
    "postgresql://test@127.0.0.1:1/test",
    false,
    { TRUST_PROXY_HOPS: "1" },
  );
  t.after(() => app.close());
  const proxy = createHttpServer((incoming, outgoing) => {
    const host = incoming.headers.host;
    const peer = incoming.socket.remoteAddress;
    if (!host || !peer) {
      outgoing.writeHead(400).end();
      return;
    }
    const upstream = request(
      `${url}/test/ip`,
      {
        headers: {
          ...incoming.headers,
          host,
          "x-forwarded-for": peer,
          "x-forwarded-host": host,
          "x-forwarded-proto": "http",
        },
      },
      (response) => {
        outgoing.writeHead(response.statusCode!, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => outgoing.writeHead(502).end());
    upstream.end();
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  t.after(() => proxy[Symbol.asyncDispose]());
  const address = proxy.address();
  assert(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/test/ip`, {
    headers: {
      "X-Forwarded-For": "198.51.100.99",
      "X-Forwarded-Host": "client.example.test",
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ip: "127.0.0.1",
    hostname: "127.0.0.1",
    protocol: "http",
  });
});
