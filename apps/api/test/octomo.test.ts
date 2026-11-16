import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OctomoService } from "../src/modules/auth/octomo.service.js";
import { ConfigService } from "../src/config/config.service.js";
import { parseEnvironment } from "../src/config/environment.js";
import { DomainHttpException } from "../src/common/http/domain-http.exception.js";

test("Octomo adapter uses exact official contract and sanitizes malformed/failing responses", async (t) => {
  const config = {
    environment: parseEnvironment({
      DATABASE_URL: "postgresql://test@localhost/test",
      AUTH_SECRET: "test-secret-at-least-32-characters",
      WEB_ORIGIN: "http://localhost:3000",
      OCTOMO_API_KEY: "test-only-not-a-real-key",
    }),
  } as ConfigService;
  const service = new OctomoService(config);
  let response = Response.json({ exists: false }, { status: 201 });
  const calls: { url: string; body: unknown }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(
        options?.headers && new Headers(options.headers).get("Authorization"),
        "Octomo test-only-not-a-real-key",
      );
      calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
      return response;
    },
  );
  assert.equal(await service.exists("01012345678", "unique-message"), false);
  assert.deepEqual(calls[0], {
    url: "https://api.octoverse.kr/octomo/v1/public/message/exists",
    body: {
      mobileNum: "01012345678",
      text: "unique-message",
      withinMinutes: 5,
    },
  });
  response = Response.json(
    { qrCode: "data:image/png;base64,aGVsbG8=" },
    { status: 201 },
  );
  assert.match(await service.qrCode("unique-message"), /^data:image\/png/);
  assert.deepEqual(calls[1].body, { text: "unique-message" });
  for (const invalid of [
    Response.json({ exists: "true" }),
    new Response("private external error", { status: 429 }),
    new Response("broken json"),
  ]) {
    response = invalid;
    await assert.rejects(
      service.exists("01012345678", "unique-message"),
      (error) =>
        error instanceof DomainHttpException &&
        error.code === "PHONE_VERIFICATION_UNAVAILABLE" &&
        !String(error).includes("private"),
    );
  }
  const noKey = new OctomoService({
    environment: { ...config.environment, octomoApiKey: undefined },
  } as ConfigService);
  assert.throws(() => noKey.assertConfigured(), DomainHttpException);
});
