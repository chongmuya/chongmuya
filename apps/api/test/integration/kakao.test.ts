import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { DataSource } from "typeorm";
import { startTestApplication } from "../support/test-application.js";
import {
  legacyPolicyConsent,
  signupFixture,
} from "../support/signup-fixture.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { AccountConsent } from "../../src/modules/auth/entities/account-consent.entity.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { KakaoAttempt } from "../../src/modules/auth/entities/kakao-attempt.entity.js";
import { ExternalIdentity } from "../../src/modules/auth/entities/external-identity.entity.js";
import { PhoneVerification } from "../../src/modules/auth/entities/phone-verification.entity.js";
import { EmailVerification } from "../../src/modules/auth/entities/email-verification.entity.js";
import {
  KakaoOidcService,
  KAKAO_ISSUER,
} from "../../src/modules/auth/kakao-oidc.service.js";
import { PasswordResetService } from "../../src/modules/auth/password-reset.service.js";
import { PasswordReset } from "../../src/modules/auth/entities/password-reset.entity.js";
import { ResendMailService } from "../../src/modules/auth/resend-mail.service.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
const headers = {
  Origin: "http://localhost:3000",
  "X-CSRF-Protection": "1",
  "Content-Type": "application/json",
};
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

test("Kakao browser flow: state lifetime/replay, signup atomicity, explicit existing-account link, same identity login and revocation", async (t) => {
  assert(process.env.TEST_DATABASE_URL);
  const { app, url, logs } = await startTestApplication(
    process.env.TEST_DATABASE_URL,
    true,
    {
      KAKAO_CLIENT_ID: "test-client",
      KAKAO_CLIENT_SECRET: "test-secret",
      KAKAO_REDIRECT_URI: "http://localhost:3001/api/v1/auth/kakao/callback",
    },
  );
  t.after(() => app.close());
  await app.get(DatabaseService).connect();
  const db = app.get(DataSource);
  await db.runMigrations();
  for (const key of [
    "ip:127.0.0.1",
    "kakao-start-ip:127.0.0.1",
    "kakao-finish-ip:127.0.0.1",
  ])
    await db.manager.delete(AuthAttempt, { key: tokenHash(key) });
  const post = (path: string, body: unknown = {}, jar = "", extra = {}) =>
    fetch(`${url}/api/v1/auth/${path}`, {
      method: "POST",
      headers: { ...headers, Cookie: jar, ...extra },
      body: JSON.stringify(body),
    });
  const oauth = app.get(KakaoOidcService);
  const pending = new Map<string, { nonce: string; verifier: string }>();
  t.mock.method(
    oauth,
    "authorization",
    async (state: string, nonce: string, verifier: string) => {
      pending.set(state, { nonce, verifier });
      return `${KAKAO_ISSUER}/oauth/authorize?state=${state}`;
    },
  );
  let identity = {
      issuer: KAKAO_ISSUER,
      sub: randomUUID(),
      email: `${randomUUID()}@example.test` as string | null,
      emailVerifiedAt: new Date() as Date | null,
    },
    exchanges = 0;
  t.mock.method(
    oauth,
    "exchange",
    async (
      _parameters: URLSearchParams,
      state: string,
      nonce: string,
      verifier: string,
    ) => {
      assert.deepEqual(pending.get(state), { nonce, verifier });
      exchanges++;
      return { ...identity };
    },
  );
  const start = async (jar = "", link = false) => {
    const response = await post(
      link ? "kakao/link/start" : "kakao/start",
      link
        ? { password: "email-password1", consent: true }
        : { next: "https://evil.example" },
      jar,
    );
    assert.equal(response.status, 200);
    assert(
      response.headers
        .getSetCookie()
        .every(
          (value) =>
            /HttpOnly/.test(value) &&
            /SameSite=Lax/.test(value) &&
            !/Domain=/.test(value),
        ),
    );
    assert(!cookies(response).includes("access="));
    return {
      jar: [
        ...new Map(
          [jar, cookies(response)]
            .filter(Boolean)
            .join("; ")
            .split("; ")
            .map((item) => [item.split("=")[0], item]),
        ).values(),
      ].join("; "),
      state: new URL((await response.json()).authorizationUrl).searchParams.get(
        "state",
      )!,
    };
  };
  const callback = (flow: { jar: string; state: string }, extra = "") =>
    fetch(
      `${url}/api/v1/auth/kakao/callback?code=provider-code&state=${flow.state}${extra}`,
      { headers: { Cookie: flow.jar }, redirect: "manual" },
    );
  const initial = await start();
  assert.equal(
    (await post("kakao/start", {}, "", { Origin: "https://evil.example" }))
      .status,
    403,
  );
  assert.equal((await callback({ ...initial, jar: "" })).status, 303);
  assert.equal(exchanges, 0);
  assert(
    (await callback({ ...initial, state: "wrong-state" })).headers
      .get("location")!
      .includes("failure=invalid"),
  );
  assert.equal(exchanges, 0);
  const denied = await callback(initial, "&error=access_denied");
  assert.equal(
    denied.headers.get("location"),
    "http://localhost:3000/auth/kakao/complete",
  );
  assert.equal(
    (await (await post("kakao/status", {}, initial.jar)).json()).code,
    "KAKAO_CANCELLED",
  );
  const missingScope = await start();
  await callback(missingScope, "&error=invalid_scope");
  const configuration = await post("kakao/status", {}, missingScope.jar);
  assert.equal(configuration.status, 503);
  assert.equal((await configuration.json()).code, "KAKAO_CONFIGURATION");
  const expired = await start();
  await db.manager.update(
    KakaoAttempt,
    { stateHash: tokenHash(expired.state) },
    { expiresAt: new Date(0) },
  );
  assert(
    (await callback(expired)).headers
      .get("location")!
      .includes("failure=expired"),
  );
  const flow = await start();
  const response = await callback(flow);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/auth/kakao/complete",
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.equal(exchanges, 1);
  await callback(flow);
  assert.equal(exchanges, 1, "replayed callback never exchanges twice");
  const status = await (await post("kakao/status", {}, flow.jar)).json();
  assert.equal(status.kind, "signup");
  assert.equal(status.next, "/events");
  assert.equal(status.trustedEmail, true);
  assert.equal(
    (await fetch(`${url}/api/v1/events`, { headers: { Cookie: flow.jar } }))
      .status,
    401,
  );
  const fixture = await signupFixture(db, identity.email!);
  const { emailVerificationId, ...signup } = fixture.body;
  const jar = `${flow.jar}; ${fixture.jar}`;
  for (const [consents, expectedStatus, expectedCode] of [
    [
      signup.consents.filter((term) => term.id !== "serviceTerms"),
      400,
      "VALIDATION_FAILED",
    ],
    [
      signup.consents.map((term) =>
        term.id === "serviceTerms" ? { ...term, accepted: false } : term,
      ),
      400,
      "VALIDATION_FAILED",
    ],
    [
      signup.consents.map((term) =>
        term.id === "privacyCollection" ? signup.consents[0]! : term,
      ),
      409,
      "SIGNUP_TERMS_CHANGED",
    ],
    [
      signup.consents.map((term) =>
        term.id === "marketing" ? { ...term, version: "old-marketing" } : term,
      ),
      409,
      "SIGNUP_TERMS_CHANGED",
    ],
  ] as const) {
    const rejected = await post("kakao/signup", { ...signup, consents }, jar);
    assert.equal(rejected.status, expectedStatus);
    assert.equal((await rejected.json()).code, expectedCode);
  }
  assert.equal(
    (
      await post(
        "kakao/signup",
        { ...signup, phoneVerificationId: randomUUID() },
        jar,
      )
    ).status,
    400,
  );
  assert.equal(await db.manager.countBy(Account, { email: signup.email }), 0);
  const trigger = `kakao_${randomUUID().replaceAll("-", "")}`;
  await db.query(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM accounts WHERE id = NEW."accountId" AND email = '${signup.email}') THEN RAISE EXCEPTION 'test-only rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  try {
    assert.equal((await post("kakao/signup", signup, jar)).status, 500);
    assert.equal(await db.manager.countBy(Account, { email: signup.email }), 0);
    assert.equal(
      await db.manager.countBy(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        sub: identity.sub,
      }),
      0,
    );
    assert.equal(
      (await db.manager.findOneByOrFail(PhoneVerification, { id: fixture.id }))
        .consumedAt,
      null,
    );
  } finally {
    await db.query(
      `DROP TRIGGER ${trigger} ON auth_sessions; DROP FUNCTION ${trigger}()`,
    );
  }
  const simultaneous = await Promise.all([
    post("kakao/signup", signup, jar),
    post("kakao/signup", signup, jar),
  ]);
  assert.deepEqual(
    simultaneous.map((value) => value.status).sort(),
    [201, 400],
  );
  const created = simultaneous.find((value) => value.status === 201)!;
  const account = (await created.json()).account;
  const stored = await db.manager.findOneByOrFail(Account, { id: account.id });
  const consents = await db.manager.findBy(AccountConsent, {
    accountId: account.id,
  });
  assert.deepEqual(
    Object.fromEntries(
      consents.map(({ termId, accepted }) => [termId, accepted]),
    ),
    { serviceTerms: true, privacyCollection: true, marketing: false },
  );
  assert.equal(stored.passwordHash, null);
  assert.equal(stored.name, signup.name);
  assert.equal(account.accountType, null);
  assert.equal(stored.accountType, null);
  const role = await fetch(`${url}/api/v1/auth/first-setup`, {
    method: "PATCH",
    headers: { ...headers, Cookie: cookies(created) },
    body: JSON.stringify({ accountType: "owner" }),
  });
  assert.equal(role.status, 200);
  assert.equal((await role.json()).accountType, "owner");
  assert.equal(stored.nickname, null);
  assert.equal(stored.emailVerificationSource, "kakao");
  assert(stored.emailVerifiedAt);
  assert(stored.phoneVerifiedAt);
  assert.equal(
    (
      await db.manager.findOneByOrFail(EmailVerification, {
        id: emailVerificationId,
      })
    ).consumedAt,
    null,
  );
  // Existing identity is authoritative even after provider email changes.
  identity.email = `${randomUUID()}@example.test`;
  const again = await start();
  await callback(again);
  const login = await post("kakao/login", {}, again.jar);
  assert.equal(login.status, 200);
  const returningAccount = (await login.json()).account;
  assert.equal(returningAccount.id, account.id);
  assert.equal(returningAccount.accountType, "owner");
  assert.equal(
    (await db.manager.findOneByOrFail(Account, { id: account.id })).email,
    signup.email,
  );
  // No automatic link for matching email, regardless of provider verification.
  identity = {
    issuer: KAKAO_ISSUER,
    sub: randomUUID(),
    email: signup.email,
    emailVerifiedAt: new Date(),
  };
  const socialOverlap = await start();
  await callback(socialOverlap);
  assert.equal(
    (await (await post("kakao/status", {}, socialOverlap.jar)).json()).kind,
    "existing",
  );
  assert.equal((await post("kakao/login", {}, socialOverlap.jar)).status, 400);
  assert.equal(
    await db.manager.countBy(ExternalIdentity, { accountId: account.id }),
    1,
  );
  const emailFixture = await signupFixture(db);
  const emailSignup = await post(
    "signup",
    { ...emailFixture.body, password: "email-password1" },
    emailFixture.jar,
  );
  const emailAccount = (await emailSignup.json()).account,
    emailJar = cookies(emailSignup);
  identity = {
    issuer: KAKAO_ISSUER,
    sub: randomUUID(),
    email: emailFixture.body.email,
    emailVerifiedAt: null,
  };
  const overlap = await start();
  await callback(overlap);
  assert.equal(
    (await (await post("kakao/status", {}, overlap.jar)).json()).kind,
    "existing",
  );
  assert.equal(
    (
      await post(
        "kakao/signup",
        emailFixture.body,
        `${overlap.jar}; ${emailFixture.jar}`,
      )
    ).status,
    409,
  );
  assert.equal(
    (await post("kakao/link/confirm", {}, `${overlap.jar}; ${emailJar}`))
      .status,
    403,
  );
  assert.equal(
    await db.manager.countBy(ExternalIdentity, { accountId: emailAccount.id }),
    0,
  );
  assert.equal(
    (
      await post(
        "kakao/link/start",
        { password: "wrong-password", consent: true },
        emailJar,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        "kakao/link/start",
        { password: "email-password1", consent: false },
        emailJar,
      )
    ).status,
    403,
  );
  const link = await start(emailJar, true);
  await callback(link);
  assert.equal((await post("kakao/link/confirm", {}, link.jar)).status, 200);
  assert.equal(
    (
      await db.manager.findOneByOrFail(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        sub: identity.sub,
      })
    ).accountId,
    emailAccount.id,
  );
  const providerLogin = await start();
  await callback(providerLogin);
  assert.equal(
    (await (await post("kakao/login", {}, providerLogin.jar)).json()).account
      .id,
    emailAccount.id,
  );
  assert.equal(
    (
      await (
        await post("login", {
          email: emailFixture.body.email,
          password: "email-password1",
        })
      ).json()
    ).account.id,
    emailAccount.id,
  );
  const beforeProfile = await db.manager.findOneByOrFail(Account, {
    id: emailAccount.id,
  });
  const repeat = await start(emailJar, true);
  await callback(repeat);
  assert.equal((await post("kakao/link/confirm", {}, repeat.jar)).status, 200);
  assert.equal(
    await db.manager.countBy(ExternalIdentity, { accountId: emailAccount.id }),
    1,
  );
  assert.deepEqual(
    await db.manager.findOneByOrFail(Account, { id: emailAccount.id }),
    beforeProfile,
  );
  // An already connected provider cannot be stolen by a second account.
  const anotherFixture = await signupFixture(db);
  const anotherSignup = await post(
    "signup",
    { ...anotherFixture.body, password: "email-password1" },
    anotherFixture.jar,
  );
  const anotherJar = cookies(anotherSignup);
  const stolen = await start(anotherJar, true);
  await callback(stolen);
  assert.equal((await post("kakao/link/confirm", {}, stolen.jar)).status, 409);
  const old = await start(emailJar, true);
  await callback(old);
  assert.equal(
    (
      await post(
        "kakao/link/confirm",
        {},
        `${old.jar.split("; ").find((value) => value.startsWith("kakao-browser="))}; ${anotherJar}`,
      )
    ).status,
    403,
  );
  await post("logout", {}, old.jar);
  assert.equal((await post("kakao/link/confirm", {}, old.jar)).status, 401);
  const replaced = await start();
  const replacedRow = await db.manager.findOneByOrFail(KakaoAttempt, {
    stateHash: tokenHash(replaced.state),
  });
  const replacement = await start(replaced.jar);
  await callback(replaced);
  assert.equal(
    (
      await db.manager.findOneByOrFail(KakaoAttempt, {
        stateHash: tokenHash(replacement.state),
      })
    ).status,
    "requested",
  );
  await post("kakao/cancel", { id: replacedRow.id }, replacement.jar);
  await callback(replacement);
  assert.equal(
    (await post("kakao/status", {}, replacement.jar)).status,
    200,
    "late cancel cannot invalidate a newer flow",
  );
  const cancelled = await start();
  const cancelledRow = await db.manager.findOneByOrFail(KakaoAttempt, {
    stateHash: tokenHash(cancelled.state),
  });
  await post("kakao/cancel", { id: cancelledRow.id }, cancelled.jar);
  await callback(cancelled);
  assert.equal((await post("kakao/status", {}, cancelled.jar)).status, 400);
  assert(!JSON.stringify(logs).includes("provider-code"));
  assert(!JSON.stringify(logs).includes("email-password1"));
  assert(!JSON.stringify(logs).includes(initial.state));
  // Provider omission/changed address requires the existing independent email verification.
  identity = {
    issuer: KAKAO_ISSUER,
    sub: randomUUID(),
    email: null,
    emailVerifiedAt: null,
  };
  const unverified = await start();
  await callback(unverified);
  const extra = await signupFixture(db);
  const missingEmailProof = { ...extra.body, emailVerificationId: undefined };
  assert.equal(
    (
      await post(
        "kakao/signup",
        missingEmailProof,
        `${unverified.jar}; ${extra.jar}`,
      )
    ).status,
    400,
  );
  const joinedWithLegacyPolicy = await post(
    "kakao/signup",
    { ...extra.body, consents: [...extra.body.consents, legacyPolicyConsent] },
    `${unverified.jar}; ${extra.jar}`,
  );
  assert.equal(joinedWithLegacyPolicy.status, 201);
  const legacyAccount = (await joinedWithLegacyPolicy.json()).account;
  assert.equal(
    await db.manager.countBy(AccountConsent, { accountId: legacyAccount.id }),
    3,
  );
  assert.equal(
    await db.manager.countBy(AccountConsent, {
      accountId: legacyAccount.id,
      termId: "privacyPolicy",
    }),
    0,
  );
  // Reauthentication expiration is independent of the OAuth attempt lifetime.
  identity = {
    issuer: KAKAO_ISSUER,
    sub: randomUUID(),
    email: null,
    emailVerifiedAt: null,
  };
  const expiredProof = await start(anotherJar, true);
  await callback(expiredProof);
  await db.manager.update(
    KakaoAttempt,
    { stateHash: tokenHash(expiredProof.state) },
    { reauthenticatedAt: new Date(Date.now() - 301_000) },
  );
  assert.equal(
    (await post("kakao/link/confirm", {}, expiredProof.jar)).status,
    403,
  );
  const racingLink = await start(anotherJar, true);
  await callback(racingLink);
  const anotherId = (
    await db.manager.findOneByOrFail(Account, {
      email: anotherFixture.body.email,
    })
  ).id;
  const resetToken = randomBytes(32).toString("base64url");
  await db.manager.insert(PasswordReset, {
    hash: tokenHash(`password-reset:${resetToken}`),
    accountId: anotherId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    delivery: "sent",
    usedAt: null,
    invalidatedAt: null,
  });
  t.mock.method(app.get(ResendMailService), "send", async () => undefined);
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const waitForLocks = async (count: number) => {
    for (let i = 0; i < 200; i++) {
      const waits = await db.query<{ count: string }[]>(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
      );
      if (Number(waits[0].count) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("credential lock was not reached");
  };
  try {
    await runner.manager.findOneOrFail(Account, {
      where: { id: anotherId },
      lock: { mode: "pessimistic_write" },
    });
    const reset = app
      .get(PasswordResetService)
      .reset(resetToken, "new-password1", randomUUID());
    await waitForLocks(1);
    const linking = post("kakao/link/confirm", {}, racingLink.jar);
    await waitForLocks(2); // access guard passed before reset committed
    await runner.commitTransaction();
    await reset;
    const rejectedLink = await linking;
    assert.equal(rejectedLink.status, 409);
    assert.equal((await rejectedLink.json()).code, "KAKAO_CONTEXT_CHANGED");
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
  }
  assert.equal(
    await db.manager.countBy(ExternalIdentity, { accountId: anotherId }),
    0,
  );
  assert.equal(
    (
      await db.manager.findOneByOrFail(KakaoAttempt, {
        stateHash: tokenHash(racingLink.state),
      })
    ).status,
    "cancelled",
  );
});
