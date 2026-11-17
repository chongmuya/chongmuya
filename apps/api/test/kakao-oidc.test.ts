import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  KakaoOidcService,
  KAKAO_ISSUER,
} from "../src/modules/auth/kakao-oidc.service.js";
import { ConfigService } from "../src/config/config.service.js";
import { parseEnvironment } from "../src/config/environment.js";
import { DomainHttpException } from "../src/common/http/domain-http.exception.js";

const metadata = {
  issuer: KAKAO_ISSUER,
  authorization_endpoint: `${KAKAO_ISSUER}/oauth/authorize`,
  token_endpoint: `${KAKAO_ISSUER}/oauth/token`,
  jwks_uri: `${KAKAO_ISSUER}/.well-known/jwks.json`,
  userinfo_endpoint: "https://kapi.kakao.com/v1/oidc/userinfo",
  token_endpoint_auth_methods_supported: ["client_secret_post"],
  id_token_signing_alg_values_supported: ["RS256"],
  response_types_supported: ["code"],
  subject_types_supported: ["pairwise"],
  code_challenge_methods_supported: ["S256"],
};
test("Kakao OIDC verifies real JWS, required claims, PKCE, state and UserInfo subject; email is trusted only from verified UserInfo", async (t) => {
  let key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const config = new KakaoOidcService({
    environment: parseEnvironment({
      DATABASE_URL: "postgresql://test@localhost/test",
      AUTH_SECRET: "x".repeat(32),
      WEB_ORIGIN: "http://localhost:3000",
      KAKAO_CLIENT_ID: "test-client",
      KAKAO_CLIENT_SECRET: "test-secret",
      KAKAO_REDIRECT_URI: "http://localhost:3000/api/v1/auth/kakao/callback",
    }),
  } as ConfigService);
  let kid = "test-key";
  let override: Record<string, unknown> = {},
    invalidSignature = false,
    algorithm = "RS256",
    userSub = "12345",
    userEmail: string | undefined = "test@example.com",
    verified = true,
    jwksRequests = 0,
    tokenRequests = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      assert(init?.signal, "every external request has a timeout");
      if (url.endsWith("/.well-known/openid-configuration"))
        return Response.json(metadata);
      if (url.endsWith("/.well-known/jwks.json")) {
        jwksRequests++;
        return Response.json({
          keys: [
            {
              ...key.publicKey.export({ format: "jwk" }),
              kid,
              alg: "RS256",
              use: "sig",
            },
          ],
        });
      }
      if (url === metadata.token_endpoint) {
        tokenRequests++;
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("client_secret"), "test-secret");
        assert.equal(body.get("client_id"), "test-client");
        if (body.get("code_verifier") !== "verifier-test-value")
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        const claims = {
          iss: KAKAO_ISSUER,
          sub: "12345",
          aud: "test-client",
          exp: Math.floor(Date.now() / 1000) + 300,
          iat: Math.floor(Date.now() / 1000),
          nonce: "nonce-test",
          email: "untrusted-claim@example.com",
          ...override,
        };
        const payload = [
          Buffer.from(JSON.stringify({ alg: algorithm, kid })).toString(
            "base64url",
          ),
          Buffer.from(JSON.stringify(claims)).toString("base64url"),
        ].join(".");
        const signature = sign(
          "RSA-SHA256",
          Buffer.from(payload),
          invalidSignature ? wrongKey.privateKey : key.privateKey,
        ).toString("base64url");
        return Response.json({
          access_token: "test-access-only",
          token_type: "Bearer",
          expires_in: 300,
          id_token: `${payload}.${signature}`,
          refresh_token: "never-store-this",
        });
      }
      assert.equal(url, metadata.userinfo_endpoint);
      return Response.json({
        sub: userSub,
        email: userEmail,
        email_verified: verified,
      });
    },
  );
  const authorization = new URL(
    await config.authorization(
      "state-test",
      "nonce-test",
      "verifier-test-value",
    ),
  );
  assert.equal(authorization.searchParams.get("scope"), "openid account_email");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    authorization.searchParams.get("code_challenge"),
    createHash("sha256").update("verifier-test-value").digest("base64url"),
  );
  const exchange = (state = "state-test", verifier = "verifier-test-value") =>
    config.exchange(
      new URLSearchParams({ code: "one-use-code", state }),
      "state-test",
      "nonce-test",
      verifier,
    );
  const success = await exchange();
  assert.equal(success.email, userEmail);
  assert(success.emailVerifiedAt instanceof Date);
  assert.deepEqual(Object.keys(success).sort(), [
    "email",
    "emailVerifiedAt",
    "issuer",
    "sub",
  ]);
  verified = false;
  assert.equal((await exchange()).emailVerifiedAt, null);
  userEmail = undefined;
  assert.equal((await exchange()).email, null);
  invalidSignature = true;
  await assert.rejects(exchange, DomainHttpException);
  invalidSignature = false;
  for (override of [
    { iss: "https://evil.example" },
    { aud: "another-client" },
    { exp: 1 },
    { nonce: "different-nonce" },
    { sub: "" },
    { sub: undefined },
    { iat: undefined },
  ])
    await assert.rejects(exchange, DomainHttpException);
  override = {};
  algorithm = "HS256";
  await assert.rejects(exchange, DomainHttpException);
  algorithm = "RS256";
  userSub = "other-person";
  await assert.rejects(exchange, DomainHttpException);
  userSub = "12345";
  const before = tokenRequests;
  await assert.rejects(() => exchange("wrong-state"), DomainHttpException);
  assert.equal(tokenRequests, before, "state mismatch never exchanges a code");
  await assert.rejects(
    () => exchange("state-test", "wrong-verifier"),
    DomainHttpException,
  );
  assert.equal(
    tokenRequests,
    before + 1,
    "invalid code exchange is never retried",
  );
  assert.equal(
    jwksRequests,
    1,
    "JWKS is cached, not fetched per authentication",
  );
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 600_000);
  key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  kid = "rotated-key";
  await exchange();
  assert.equal(
    jwksRequests,
    2,
    "expired JWKS is refetched and a rotated signing key works",
  );
});
