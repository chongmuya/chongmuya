import { verifiedEmailFixture } from "../support/signup-fixture.js";
import { EmailVerification } from "../../src/modules/auth/entities/email-verification.entity.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { OctomoService } from "../../src/modules/auth/octomo.service.js";
import { PhoneVerification } from "../../src/modules/auth/entities/phone-verification.entity.js";
import { Account } from "../../src/modules/auth/entities/account.entity.js";
import { AccountConsent } from "../../src/modules/auth/entities/account-consent.entity.js";
import { AuthSession } from "../../src/modules/auth/entities/auth-session.entity.js";
import {
  signupTerms,
  signupTermsVersion,
} from "../../src/modules/auth/utils/signup-terms.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";

test("phone proof is requester-bound, expiring, revocable, single-use and atomic with signup", async (t) => {
  const { app, db, call, logs } = await startResourceApplication(t);
  const octomo = app.get(OctomoService);
  t.mock.method(octomo, "assertConfigured", () => {});
  t.mock.method(octomo, "qrCode", async () => "data:image/png;base64,aGVsbG8=");
  let received = false;
  let upstreamCalls = 0;
  let pending: (() => void) | undefined;
  t.mock.method(octomo, "exists", async (phone: string, message: string) => {
    upstreamCalls++;
    assert.match(phone, /^010\d{8}$/);
    assert.match(message, /^총무야 가입 [A-F0-9]{32}$/);
    if (pending)
      await new Promise<void>((resolve) => {
        pending = resolve;
      });
    return received;
  });
  await db
    .getRepository(AuthAttempt)
    .delete({ key: tokenHash("phone-issue-ip:127.0.0.1") });
  let n = 0;
  const context = async () => {
    const response = await call("auth/signup/context", "", "POST");
    assert.equal(response.status, 204);
    assert.match(response.headers.getSetCookie()[0], /HttpOnly/);
    return response.headers.getSetCookie()[0].split(";")[0];
  };
  const create = async (jar: string) => {
    const phone = `010${String(++n).padStart(8, "0")}`;
    await db
      .getRepository(AuthAttempt)
      .delete({ key: tokenHash(`phone-issue-number:${phone}`) });
    const response = await call(
      "auth/signup/phone-verifications",
      jar,
      "POST",
      { phone },
    );
    assert.equal(response.status, 201);
    const challenge = (await response.json()) as {
      id: string;
      phone: string;
      message: string;
      expiresAt: string;
    };
    await db
      .getRepository(PhoneVerification)
      .update({ id: challenge.id }, { nextCheckAt: new Date(0) });
    await verifiedEmailFixture(
      db,
      `${challenge.id}@example.test`,
      tokenHash(jar.split("=")[1]),
      challenge.id,
    );
    return challenge;
  };
  const check = (jar: string, row: { id: string; phone: string }) =>
    call("auth/signup/phone-verifications/check", jar, "POST", {
      id: row.id,
      phone: row.phone,
    });
  const payload = (row: { id: string; phone: string }) => ({
    email: `${row.id}@example.test`,
    emailVerificationId: row.id,
    password: "valid-pass123",
    name: "이름",
    phone: row.phone,
    phoneVerificationId: row.id,
    consents: signupTerms.map((term) => ({
      id: term.id,
      version: signupTermsVersion,
      accepted: term.required,
    })),
  });
  assert.equal(
    (
      await call("auth/signup", "", "POST", {
        email: "old@example.test",
        password: "valid-pass123",
      })
    ).status,
    400,
  );
  const a = await context();
  const row = await create(a);
  const input = payload(row);
  assert.equal(
    (await call("auth/signup", a, "POST", { ...input, verified: true })).status,
    400,
  );
  assert.equal((await call("auth/signup", a, "POST", input)).status, 400);
  assert.equal((await check(await context(), row)).status, 400);
  assert.equal((await check(a, { ...row, phone: "01099999999" })).status, 400);
  assert.equal((await check(a, row)).status, 200);
  assert.equal((await check(a, row)).status, 429);
  assert.equal(upstreamCalls, 1);
  received = true;
  await db
    .getRepository(PhoneVerification)
    .update({ id: row.id }, { nextCheckAt: new Date(0) });
  const verified = await check(a, row);
  assert.equal((await verified.json()).status, "verified");
  assert.equal(
    (await call("auth/signup", a, "POST", { ...input, phone: "01099999999" }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("auth/signup", a, "POST", {
        ...input,
        consents: input.consents.map((term) => ({ ...term, accepted: false })),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("auth/signup", a, "POST", {
        ...input,
        consents: input.consents.map((term) => ({ ...term, version: "old" })),
      })
    ).status,
    409,
  );

  // Real DB insert error after proof consumption: everything rolls back together.
  const beforeConsents = await db.getRepository(AccountConsent).count();
  const beforeSessions = await db.getRepository(AuthSession).count();
  await db.query(
    `CREATE FUNCTION signup_test_reject_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private injected failure'; END $$`,
  );
  try {
    await db.query(
      `CREATE TRIGGER signup_test_consent_failure BEFORE INSERT ON account_consents FOR EACH ROW EXECUTE FUNCTION signup_test_reject_consent()`,
    );
    const failed = await call("auth/signup", a, "POST", input);
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.getSetCookie().length, 0);
    assert.equal(
      await db.getRepository(Account).countBy({ email: input.email }),
      0,
    );
    assert.equal(
      (
        await db
          .getRepository(EmailVerification)
          .findOneByOrFail({ id: row.id })
      ).consumedAt,
      null,
    );
    assert.equal(
      await db.getRepository(AccountConsent).count(),
      beforeConsents,
    );
    assert.equal(await db.getRepository(AuthSession).count(), beforeSessions);
    assert.equal(
      (
        await db
          .getRepository(PhoneVerification)
          .findOneByOrFail({ id: row.id })
      ).consumedAt,
      null,
    );
  } finally {
    await db.query(
      `DROP TRIGGER IF EXISTS signup_test_consent_failure ON account_consents; DROP FUNCTION signup_test_reject_consent()`,
    );
  }
  const race = await Promise.all([
    call("auth/signup", a, "POST", input),
    call("auth/signup", a, "POST", input),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 400]);
  const success = race.find((r) => r.status === 201)!;
  const account = (await success.json()).account;
  assert.equal(account.accountType, "organizer");
  assert.equal(account.name, input.name);
  assert.equal(account.nickname, null);
  assert.equal(account.phone, input.phone);
  assert(account.phoneVerifiedAt);
  assert(account.emailVerifiedAt);
  const consents = await db
    .getRepository(AccountConsent)
    .findBy({ accountId: account.id });
  assert.equal(consents.length, 4);
  assert.equal(
    consents.find((entry) => entry.termId === "marketing")?.accepted,
    false,
  );
  assert.equal(
    (
      await call("auth/signup", a, "POST", {
        ...input,
        email: `${randomUUID()}@example.test`,
      })
    ).status,
    400,
  );
  const login = await call("auth/login", "", "POST", {
    email: input.email,
    password: input.password,
  });
  assert.equal(login.status, 200);
  const sessionJar = login.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");
  const restored = await call("auth/session/restore", sessionJar, "POST");
  assert.deepEqual((await restored.json()).account, account);

  const b = await context();
  const expiring = await create(b);
  await db
    .getRepository(PhoneVerification)
    .update(
      { id: expiring.id },
      { expiresAt: new Date(0), verifiedAt: new Date() },
    );
  assert.equal((await check(b, expiring)).status, 400);
  assert.equal(
    (await call("auth/signup", b, "POST", payload(expiring))).status,
    400,
  );
  await db
    .getRepository(PhoneVerification)
    .update({ id: expiring.id }, { retryAt: new Date(0) });
  const renewed = await create(b);
  assert.notEqual(renewed.id, expiring.id);
  assert.notEqual(renewed.message, expiring.message);
  assert.equal((await check(b, expiring)).status, 400);
  assert.equal(
    (
      await call("auth/signup/phone-verifications", b, "POST", {
        phone: renewed.phone,
      })
    ).status,
    429,
  );
  await db
    .getRepository(PhoneVerification)
    .update({ id: renewed.id }, { checkCount: 12 });
  assert.equal((await check(b, renewed)).status, 429);

  const c = await context();
  const cancellable = await create(c);
  pending = () => {};
  const lateCheck = check(c, cancellable);
  for (let attempt = 0; upstreamCalls < 3; attempt++) {
    assert(attempt < 200, "provider check must start within one second");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await call("auth/signup/phone-verifications/cancel", c, "POST", {
    id: cancellable.id,
  });
  pending();
  pending = undefined;
  assert.equal((await lateCheck).status, 400);
  assert.equal(
    (await call("auth/signup", c, "POST", payload(cancellable))).status,
    400,
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    new RegExp(
      `${input.email}|${row.phone}|${row.message}|valid-pass|private injected`,
    ),
  );
});
