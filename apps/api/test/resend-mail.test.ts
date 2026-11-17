import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ResendMailService } from "../src/modules/auth/resend-mail.service.js";
import { ConfigService } from "../src/config/config.service.js";
import { parseEnvironment } from "../src/config/environment.js";
import { DomainHttpException } from "../src/common/http/domain-http.exception.js";

test("Resend delivery retries with one idempotency key, bounds requests and sanitizes failures", async (t) => {
  const service = new ResendMailService({
    environment: parseEnvironment({
      DATABASE_URL: "postgresql://test@localhost/test",
      AUTH_SECRET: "s".repeat(32),
      WEB_ORIGIN: "http://localhost:3000",
      RESEND_API_KEY: "re_test_only",
      RESEND_FROM: "총무야 <hello@example.com>",
      EMAIL_VERIFICATION_SECRET: "e".repeat(32),
    }),
  } as ConfigService);
  let mode: "retry" | "fail" | "timeout" = "retry";
  const keys: string[] = [];
  const bodies: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(String(url), "https://api.resend.com/emails");
      assert(options?.signal);
      keys.push(new Headers(options.headers).get("Idempotency-Key")!);
      bodies.push(String(options.body));
      if (mode === "timeout")
        throw new DOMException("private provider request", "TimeoutError");
      if (mode === "fail" || keys.length === 1)
        return Response.json(
          { name: "application_error", message: "private provider details" },
          { status: 500 },
        );
      return Response.json({ id: "provider-id" });
    },
  );
  await service.send("recipient@example.test", "인증", "123456", "one");
  assert.deepEqual(keys, ["one", "one"]);
  assert.equal(bodies[0], bodies[1]);
  for (const failure of ["fail", "timeout"] as const) {
    mode = failure;
    const count = keys.length;
    await assert.rejects(
      service.send("recipient@example.test", "인증", "654321", failure),
      (error) =>
        error instanceof DomainHttpException &&
        error.code === "EMAIL_VERIFICATION_UNAVAILABLE" &&
        !String(error).includes("private"),
    );
    assert.equal(keys.length - count, 2);
  }
});
