import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { getApiJson } from "../shared/http/browser-api";
import { ApiError } from "../shared/http/api-error";
import { healthQueryOptions } from "../features/health/queries";

test("browser transport handles real HTTP errors, invalid data, cancellation and recovery", async (t) => {
  let mode = "healthy";
  const server = createServer((request, response) => {
    if (mode === "slow") return;
    response.setHeader("x-request-id", "test-correlation-id");
    if (mode === "down") {
      response.writeHead(503).end("not-json: private-internal-error");
      return;
    }
    if (mode === "invalid") {
      response.end("not-json");
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        mode === "wrong-shape"
          ? { status: "fake" }
          : { status: "ok", service: "chongmuya-api" },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const nativeFetch = globalThis.fetch;
  // Supply the browser origin while retaining real network requests.
  globalThis.fetch = (input, options) =>
    nativeFetch(
      new URL(String(input), `http://127.0.0.1:${address.port}`),
      options,
    );
  const client = new QueryClient();
  t.after(async () => {
    globalThis.fetch = nativeFetch;
    client.clear();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  assert.deepEqual(await client.fetchQuery(healthQueryOptions), {
    status: "ok",
    service: "chongmuya-api",
  });
  mode = "down";
  await assert.rejects(
    client.fetchQuery(healthQueryOptions),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 503 &&
      error.requestId === "test-correlation-id" &&
      !error.message.includes("private"),
  );
  assert.equal(client.getQueryState(["health"])?.status, "error");
  assert(
    client.getQueryData(["health"]),
    "a failed refetch retains data, so UI must prioritize errors",
  );
  mode = "healthy";
  await client.fetchQuery(healthQueryOptions);
  assert.equal(client.getQueryState(["health"])?.status, "success");
  for (const broken of ["invalid", "wrong-shape"]) {
    mode = broken;
    await assert.rejects(
      client.fetchQuery(healthQueryOptions),
      (error: unknown) =>
        error instanceof ApiError && error.code === "INVALID_RESPONSE",
    );
  }
  mode = "slow";
  await assert.rejects(
    getApiJson("/api/health", { timeoutMs: 30 }),
    (error: unknown) => error instanceof ApiError && error.code === "TIMEOUT",
  );
  const controller = new AbortController();
  const pending = getApiJson("/api/health", { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await assert.rejects(
    getApiJson("/api/health"),
    (error: unknown) =>
      error instanceof ApiError && error.code === "NETWORK_ERROR",
  );
});
