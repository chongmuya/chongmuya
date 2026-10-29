import assert from "node:assert/strict";
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
    headers: { "x-request-id": "untrusted-value" },
  });
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), {
    status: "ok",
    service: "chongmuya-api",
  });
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.match(live.headers.get("x-request-id") ?? "", /^[\da-f-]{36}$/);
  assert.equal(live.headers.get("x-powered-by"), null);

  for (const [endpoint, status, code] of [
    ["/ready", 503, "SERVICE_UNAVAILABLE"],
    ["/missing?token=private-query", 404, "NOT_FOUND"],
    ["/test/error", 500, "INTERNAL_SERVER_ERROR"],
  ] as const) {
    const response = await fetch(url + endpoint);
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
      headers: { "Content-Type": "application/json" },
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
    assert.equal((await response.json()).code, "BAD_REQUEST");
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
