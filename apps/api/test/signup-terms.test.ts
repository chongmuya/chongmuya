import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvironment } from "../src/config/environment.js";
import { SignupTermsService } from "../src/modules/auth/signup-terms.service.js";

test("production uses the published legal documents even with an obsolete catalog setting", () => {
  const base = parseEnvironment({
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:3000",
    AUTH_SECRET: "test-auth-secret-at-least-32-characters",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/chongmuya_test",
    SIGNUP_TERMS_JSON: JSON.stringify([
      {
        id: "serviceTerms",
        version: "draft-2026-11-18",
        url: "https://example.test/old",
      },
    ]),
  });
  const environment = {
    ...base,
    nodeEnv: "production" as const,
    webOrigin: "https://example.test",
  };
  const service = new SignupTermsService({ environment });
  const { terms } = service.get();
  assert.deepEqual(
    terms.map(({ id, version, url }) => ({ id, version, url })),
    [
      {
        id: "serviceTerms",
        version: "2026-11-21",
        url: "https://example.test/legal/2026-11-21#service-terms",
      },
      {
        id: "privacyCollection",
        version: "2026-11-21",
        url: "https://example.test/legal/2026-11-21#privacy-collection",
      },
      {
        id: "marketing",
        version: "2026-11-21",
        url: "https://example.test/legal/2026-11-21#marketing",
      },
    ],
  );
  assert(terms.every((term) => !term.draft && term.body.length === 0));
  const consents = terms.map(({ id, version, required }) => ({
    id,
    version,
    accepted: required,
  }));
  assert.deepEqual(service.validate(consents), consents);
  assert.throws(
    () =>
      service.validate(
        consents.map((consent) => ({
          ...consent,
          version: "draft-2026-11-18",
        })),
      ),
    { code: "SIGNUP_TERMS_CHANGED" },
  );
});
