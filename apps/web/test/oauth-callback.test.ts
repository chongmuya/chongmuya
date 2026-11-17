import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/v1/auth/kakao/callback/route";

test("callback transport keeps provider secrets out of failures and forwards only the browser binding to Nest", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...values: unknown[]) => logs.push(values));
  t.mock.method(console, "log", (...values: unknown[]) => logs.push(values));
  const request = new Request(
    "http://localhost:3000/api/v1/auth/kakao/callback?code=private-code&state=private-state",
    {
      headers: {
        Cookie:
          "kakao-browser=binding; access=private-access; signup-requester=private-requester",
        Host: "evil.example",
        "X-Forwarded-Host": "evil.example",
      },
    },
  );
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const target = new URL(String(input));
      assert.equal(target.pathname, "/api/v1/auth/kakao/callback");
      assert.notEqual(target.hostname, "evil.example");
      assert.equal(target.searchParams.get("code"), "private-code");
      assert.deepEqual(init?.headers, { Cookie: "kakao-browser=binding" });
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.redirect, "manual");
      assert(init?.signal);
      return new Response(null, {
        status: 303,
        headers: { Location: "http://localhost:3000/auth/kakao/complete" },
      });
    },
  );
  const success = await GET(request);
  assert.equal(success.status, 303);
  assert.equal(
    success.headers.get("location"),
    "http://localhost:3000/auth/kakao/complete",
  );
  assert.equal(success.headers.get("cache-control"), "no-store");
  assert.equal(success.headers.get("referrer-policy"), "no-referrer");
  fetch.mock.mockImplementation(async () => {
    throw new Error("upstream failure with private-code private-state");
  });
  const failure = await GET(request);
  assert.equal(failure.status, 303);
  assert.equal(
    failure.headers.get("location"),
    "/auth/kakao/complete?failure=unavailable",
  );
  assert.equal(await failure.text(), "");
  assert.deepEqual(logs, []);
  fetch.mock.mockImplementation(
    async () => new Response("private provider body", { status: 503 }),
  );
  assert.equal(
    (await GET(request)).headers.get("location"),
    "/auth/kakao/complete?failure=unavailable",
  );
});
