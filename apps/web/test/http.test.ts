import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { requestJson } from "../shared/http/request";
import { ApiError } from "../shared/http/api-error";
import { apiOrigin } from "../shared/http/api-origin";

test("public API origin is explicit in production and cannot contain credentials, paths or queries", () => {
  assert.equal(
    apiOrigin("https://api.chongmuya.com", true),
    "https://api.chongmuya.com",
  );
  for (const value of [
    "",
    "http://api.example.com",
    "https://user:secret@api.example.com",
    "https://api.example.com/",
    "https://api.example.com/path",
    "https://api.example.com?secret=value",
    "https://api.example.com#hash",
  ])
    assert.throws(() => apiOrigin(value, true), {
      message: "Invalid environment variable: NEXT_PUBLIC_API_ORIGIN",
    });
  const previous = process.env.NEXT_PUBLIC_API_ORIGIN;
  delete process.env.NEXT_PUBLIC_API_ORIGIN;
  try {
    assert.equal(apiOrigin(undefined, false), "http://localhost:3001");
    assert.throws(() => apiOrigin(undefined, true));
  } finally {
    if (previous !== undefined) process.env.NEXT_PUBLIC_API_ORIGIN = previous;
  }
});

test("browser transport handles real HTTP errors, invalid data, cancellation and recovery", async (t) => {
  const healthQueryOptions = queryOptions({
    queryKey: ["health"],
    queryFn: ({ signal }) => requestJson("/api/v1/restaurants", { signal }),
    staleTime: 0,
    retry: false,
  });
  let mode = "healthy";
  const server = createServer((_request, response) => {
    if (mode === "slow") return;
    response.setHeader("x-request-id", "9fcf95b6-8b32-4f78-9e16-4b32f04c693b");
    if (mode === "down") {
      response.writeHead(503).end("not-json: private-internal-error");
      return;
    }
    if (mode === "invalid") {
      response.end("not-json");
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ status: "ok", service: "chongmuya-api" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const nativeFetch = globalThis.fetch;
  const previousOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
  process.env.NEXT_PUBLIC_API_ORIGIN = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = (input, options) => {
    assert.equal(
      String(input),
      `${process.env.NEXT_PUBLIC_API_ORIGIN}/api/v1/restaurants`,
    );
    assert.equal(options?.credentials, "include");
    return nativeFetch(input, options);
  };
  const client = new QueryClient();
  t.after(async () => {
    globalThis.fetch = nativeFetch;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = previousOrigin;
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
      error.requestId === "9fcf95b6-8b32-4f78-9e16-4b32f04c693b" &&
      !error.message.includes("private"),
  );
  assert.equal(client.getQueryState(["health"])?.status, "error");
  assert(
    client.getQueryData(["health"]),
    "a failed refetch retains data so the UI can preserve ongoing work",
  );
  mode = "healthy";
  await client.fetchQuery(healthQueryOptions);
  assert.equal(client.getQueryState(["health"])?.status, "success");
  for (const broken of ["invalid"]) {
    mode = broken;
    await assert.rejects(
      client.fetchQuery(healthQueryOptions),
      (error: unknown) =>
        error instanceof ApiError && error.code === "INVALID_RESPONSE",
    );
  }
  mode = "slow";
  await assert.rejects(
    requestJson("/api/v1/restaurants", {}, 30),
    (error: unknown) => error instanceof ApiError && error.code === "TIMEOUT",
  );
  const controller = new AbortController();
  const pending = requestJson("/api/v1/restaurants", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await assert.rejects(
    requestJson("/api/v1/restaurants"),
    (error: unknown) =>
      error instanceof ApiError && error.code === "NETWORK_ERROR",
  );
});
