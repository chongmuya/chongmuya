import assert from "node:assert/strict";
import { test } from "node:test";
import { requestJson } from "../shared/http/request";
import { ApiError } from "../shared/http/api-error";
import { parseApiError } from "../shared/http/error-contract";
import { safeReturnPath } from "../features/auth/lib/return-path";
import { apiOrigin } from "../shared/http/api-origin";

const requestId = "00000000-0000-4000-8000-000000000001";
const validation = {
  statusCode: 400,
  code: "VALIDATION_FAILED",
  message: "private-server-message",
  requestId,
  fieldErrors: [{ field: "name", code: "INVALID_LENGTH" }],
};
test("only validated error codes and field paths cross the browser error boundary", () => {
  const error = parseApiError(validation, 400);
  assert.equal(error.code, "VALIDATION_FAILED");
  assert.deepEqual(error.fieldErrors, validation.fieldErrors);
  assert.doesNotMatch(error.message, /private/);
  for (const body of [
    null,
    [],
    "html",
    { code: "ACCESS_EXPIRED" },
    { ...validation, statusCode: 401 },
    { ...validation, code: "UNKNOWN_PRIVATE_ERROR" },
    { ...validation, fieldErrors: { name: "private" } },
    {
      ...validation,
      fieldErrors: [{ field: "name", code: "raw_message", message: "private" }],
    },
    {
      ...validation,
      fieldErrors: [{ field: "__proto__", code: "INVALID_VALUE" }],
    },
    { ...validation, stack: "private-stack" },
    { ...validation, requestId: "private-id" },
  ]) {
    const rejected = parseApiError(body, 400);
    assert.equal(rejected.code, "HTTP_ERROR");
    assert.equal(rejected.fieldErrors, undefined);
    assert.doesNotMatch(rejected.message, /private/);
  }
  for (const code of [
    "ACCESS_EXPIRED",
    "SESSION_INVALID",
    "INVALID_CREDENTIALS",
  ]) {
    assert.equal(
      parseApiError(
        { statusCode: 401, code, message: "private", requestId },
        401,
      ).code,
      code,
    );
  }
});

test("requestJson preserves methods, CSRF, 204, cancellation and safe malformed error handling", async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, options: RequestInit) => {
      assert.equal(String(_input), `${apiOrigin()}/api/v1/events`);
      calls.push(options);
      return new Response(null, { status: 204 });
    },
  );
  for (const method of ["POST", "PUT", "PATCH"]) {
    assert.equal(
      await requestJson("/api/v1/events", { method, body: "{}" }),
      undefined,
    );
    const call = calls.at(-1)!;
    assert.equal(call.method, method);
    assert.equal(new Headers(call.headers).get("X-CSRF-Protection"), "1");
    assert.equal(call.credentials, "include");
  }
  for (const [status, content, code] of [
    [400, JSON.stringify(validation), "VALIDATION_FAILED"],
    [502, "<html>private upstream</html>", "HTTP_ERROR"],
    [503, "{broken-json", "HTTP_ERROR"],
    [
      500,
      JSON.stringify({
        statusCode: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "private SQL",
        requestId,
      }),
      "INTERNAL_SERVER_ERROR",
    ],
    [200, "{broken-json", "INVALID_RESPONSE"],
  ] as const) {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(content, { status }),
    );
    await assert.rejects(requestJson("/api/v1/events"), (error: unknown) => {
      assert(error instanceof ApiError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
  }
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, "fetch", async () => {
    throw controller.signal.reason;
  });
  await assert.rejects(
    requestJson("/api/v1/events", { signal: controller.signal }),
    (error) => error === controller.signal.reason,
  );
  t.mock.method(AbortSignal, "timeout", () =>
    AbortSignal.abort(new DOMException("timeout", "TimeoutError")),
  );
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("timeout", "TimeoutError");
  });
  await assert.rejects(
    requestJson("/api/v1/events"),
    (error: unknown) => error instanceof ApiError && error.code === "TIMEOUT",
  );
});

test("login resumes only known internal routes and valid resource parameters", () => {
  assert.equal(
    safeReturnPath(`/events?event=${requestId}`),
    `/events?event=${requestId}`,
  );
  assert.equal(
    safeReturnPath(`/mypage?group=${requestId}`),
    `/mypage?group=${requestId}`,
  );
  assert.equal(safeReturnPath("/"), "/");
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/auth?next=//evil.example",
    "/api/v1/events",
    "/%2f%2fevil.example",
    "/events\n//evil.example",
  ])
    assert.equal(safeReturnPath(value), "/events");
  assert.equal(
    safeReturnPath("/events?event=invalid&next=https://evil.example#anything"),
    "/events",
  );
});
