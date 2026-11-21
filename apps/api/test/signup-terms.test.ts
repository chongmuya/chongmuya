import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvironment } from "../src/config/environment.js";
import { SignupTermsService } from "../src/modules/auth/signup-terms.service.js";

test("the production catalog preserves its draft until publication URLs are configured", () => {
  const base = parseEnvironment({
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    AUTH_SECRET: "test-auth-secret-at-least-32-characters",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/chongmuya_test",
  });
  const environment = {
    ...base,
    nodeEnv: "production" as const,
    webOrigin: "https://example.test",
  };
  const { terms } = new SignupTermsService({ environment }).get();
  assert(
    terms.every(
      (term) => term.draft && term.url === null && term.body.length > 0,
    ),
  );
  assert(terms.every((term) => term.version === "draft-2026-11-18"));
  assert.equal(
    terms.find((term) => term.id === "privacyPolicy")?.required,
    false,
  );

  const configured = terms.map(({ id }) => ({
    id,
    version: "2026-11-21",
    url: `https://example.test/terms#${id}`,
  }));
  const current = new SignupTermsService({
    environment: { ...environment, signupTerms: configured },
  }).get().terms;
  assert.deepEqual(
    current.map(({ id, version, url }) => ({ id, version, url })),
    configured,
  );
  assert(current.every((term) => !term.draft && term.body.length === 0));
});
