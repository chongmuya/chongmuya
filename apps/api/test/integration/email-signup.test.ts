import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { startResourceApplication } from "../support/resource-application.js";
import { signupFixture } from "../support/signup-fixture.js";
import { ResendMailService } from "../../src/modules/auth/resend-mail.service.js";
import { EmailVerification } from "../../src/modules/auth/entities/email-verification.entity.js";
import { AccountConsent } from "../../src/modules/auth/entities/account-consent.entity.js";
import { PhoneVerification } from "../../src/modules/auth/entities/phone-verification.entity.js";
import { AuthAttempt } from "../../src/modules/auth/entities/auth-attempt.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
import { DomainHttpException } from "../../src/common/http/domain-http.exception.js";

test("email codes bind owner/address, survive resend limits, expire and consume only with both proofs", async (t) => {
  const { app, db, call, logs } = await startResourceApplication(t);
  const catalog = await (await call("auth/signup/terms")).json();
  assert.deepEqual(
    catalog.terms.map(({ id, required }: { id: string; required: boolean }) => [
      id,
      required,
    ]),
    [
      ["serviceTerms", true],
      ["privacyCollection", true],
      ["marketing", false],
    ],
  );
  assert.deepEqual(
    catalog.terms.map(({ url }: { url: string }) => url),
    [
      "http://localhost:3000/legal/2026-11-21-v2#service-terms",
      "http://localhost:3000/legal/2026-11-21-v2#privacy-collection",
      "http://localhost:3000/legal/2026-11-21-v2#marketing",
    ],
  );
  assert(
    catalog.terms.every(
      ({
        version,
        body,
        draft,
      }: {
        version: string;
        body: string[];
        draft: boolean;
      }) => version === "2026-11-21-v2" && body.length === 0 && !draft,
    ),
  );
  const mail = app.get(ResendMailService);
  const messages = new Map<string, string>();
  t.mock.method(
    mail,
    "send",
    async (_to: string, _subject: string, text: string, id: string) => {
      const code = text.match(/\b\d{6}\b/)?.[0];
      assert(code);
      messages.set(id.replace("signup-email/", ""), code);
    },
  );
  for (const kind of ["issue", "check"])
    await db
      .getRepository(AuthAttempt)
      .delete({ key: tokenHash(`email-${kind}-ip:127.0.0.1`) });
  const fixture = await signupFixture(db);
  await db
    .getRepository(EmailVerification)
    .delete({ id: fixture.body.emailVerificationId });
  const { email } = fixture.body;
  const context = await call("auth/signup/context", fixture.jar, "POST");
  assert.equal(
    context.headers.getSetCookie()[0].split(";")[0],
    fixture.jar,
    "email context must preserve the phone requester",
  );
  const create = () =>
    call("auth/signup/email-verifications", fixture.jar, "POST", {
      email: ` ${email.toUpperCase()} `,
    });
  const check = (
    id: string,
    code = messages.get(id),
    jar = fixture.jar,
    address = email,
  ) =>
    call("auth/signup/email-verifications/check", jar, "POST", {
      id,
      email: address,
      code,
    });
  const response = await create();
  assert.equal(response.status, 201);
  let proof = await response.json();
  assert.equal(proof.status, "pending");
  assert.equal(proof.email, email);
  assert.equal(proof.code, undefined);
  assert.equal(Date.parse(proof.expiresAt) - Date.parse(proof.retryAt), 540000);
  const row = await db
    .getRepository(EmailVerification)
    .findOneByOrFail({ id: proof.id });
  assert.match(row.codeHash, /^[a-f0-9]{64}$/);
  assert.notEqual(row.codeHash, tokenHash(messages.get(proof.id)!));
  assert.equal(row.verifiedAt, null);
  const input = () => ({
    ...fixture.body,
    emailVerificationId: proof.id,
    password: "test-pass123",
  });
  assert.equal(
    (await call("auth/signup", fixture.jar, "POST", input())).status,
    400,
  );
  assert.equal((await create()).status, 429);
  const stranger = await signupFixture(db);
  assert.equal(
    (await check(proof.id, messages.get(proof.id), stranger.jar)).status,
    400,
  );
  assert.equal(
    (
      await check(
        proof.id,
        messages.get(proof.id),
        fixture.jar,
        "wrong@example.test",
      )
    ).status,
    400,
  );
  const wrong = messages.get(proof.id) === "000000" ? "111111" : "000000";
  for (let n = 0; n < 5; n++) {
    const result = await check(proof.id, wrong);
    assert.equal(
      (await result.json()).code,
      n === 4 ? "EMAIL_VERIFICATION_LIMIT" : "EMAIL_VERIFICATION_MISMATCH",
    );
  }
  assert.equal((await check(proof.id)).status, 429);
  assert.equal(
    (
      await db
        .getRepository(EmailVerification)
        .findOneByOrFail({ id: proof.id })
    ).failures,
    5,
  );
  const old = proof;
  await db
    .getRepository(EmailVerification)
    .update({ id: proof.id }, { retryAt: new Date(0) });
  proof = await (await create()).json();
  assert.notEqual(proof.id, old.id);
  assert.equal((await check(old.id)).status, 400);
  await db
    .getRepository(EmailVerification)
    .update({ id: proof.id }, { expiresAt: new Date(0) });
  assert.equal(
    (await (await check(proof.id)).json()).code,
    "EMAIL_VERIFICATION_EXPIRED",
  );
  await db
    .getRepository(EmailVerification)
    .update({ id: proof.id }, { retryAt: new Date(0) });
  proof = await (await create()).json();
  const success = await check(proof.id);
  assert.equal((await success.json()).status, "verified");
  const verifiedAt = (
    await db.getRepository(EmailVerification).findOneByOrFail({ id: proof.id })
  ).verifiedAt;
  await db
    .getRepository(PhoneVerification)
    .update({ id: fixture.id }, { verifiedAt: null });
  assert.equal(
    (await call("auth/signup", fixture.jar, "POST", input())).status,
    400,
  );
  assert.equal(
    (
      await db
        .getRepository(EmailVerification)
        .findOneByOrFail({ id: proof.id })
    ).consumedAt,
    null,
  );
  await db
    .getRepository(PhoneVerification)
    .update({ id: fixture.id }, { verifiedAt: new Date() });
  const joined = await call("auth/signup", fixture.jar, "POST", input());
  assert.equal(joined.status, 201);
  const { account } = await joined.json();
  assert.equal(account.emailVerifiedAt, verifiedAt!.toISOString());
  const consents = await db
    .getRepository(AccountConsent)
    .findBy({ accountId: account.id });
  assert.deepEqual(
    Object.fromEntries(
      consents.map(({ termId, accepted }) => [termId, accepted]),
    ),
    { serviceTerms: true, privacyCollection: true, marketing: false },
  );
  assert.equal((await check(proof.id)).status, 400);
  assert.equal(
    (await call("auth/signup", fixture.jar, "POST", input())).status,
    400,
  );
  assert(
    (
      await db
        .getRepository(EmailVerification)
        .findOneByOrFail({ id: proof.id })
    ).consumedAt,
  );
  const encodedLogs = JSON.stringify(logs);
  for (const secret of [...messages.values(), email, "test-pass123"])
    assert(!encodedLogs.includes(secret));
});

test("email delivery failure and late delivery cannot verify or revive cancelled requests; resend cannot reset aggregate checks", async (t) => {
  const { app, db, call } = await startResourceApplication(t);
  for (const kind of ["issue", "check"])
    await db
      .getRepository(AuthAttempt)
      .delete({ key: tokenHash(`email-${kind}-ip:127.0.0.1`) });
  const mail = app.get(ResendMailService);
  const fixture = await signupFixture(db);
  let mode: "fail" | "delay" | "success" = "fail";
  let release!: () => void;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => {
    started = resolve;
  });
  t.mock.method(mail, "send", async () => {
    if (mode === "fail")
      throw new DomainHttpException("EMAIL_VERIFICATION_UNAVAILABLE");
    if (mode === "delay") {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
  });
  const create = () =>
    call("auth/signup/email-verifications", fixture.jar, "POST", {
      email: fixture.body.email,
    });
  let result = await (await create()).json();
  assert.equal(result.status, "failed");
  assert.equal(
    (
      await db
        .getRepository(EmailVerification)
        .findOneByOrFail({ id: result.id })
    ).verifiedAt,
    null,
  );
  await db
    .getRepository(EmailVerification)
    .update({ id: result.id }, { retryAt: new Date(0) });
  mode = "delay";
  const pending = create();
  await sending;
  const inflight = await db
    .getRepository(EmailVerification)
    .findOneByOrFail({ requesterHash: tokenHash(fixture.jar.split("=")[1]) });
  // Cancellation completes while the provider is still pending: no transaction/lock spans delivery.
  assert.equal(
    (
      await call(
        "auth/signup/email-verifications/cancel",
        fixture.jar,
        "POST",
        { id: inflight.id },
      )
    ).status,
    204,
  );
  release();
  assert.equal((await pending).status, 400);
  mode = "success";
  await db
    .getRepository(EmailVerification)
    .update({ id: inflight.id }, { retryAt: new Date(0) });
  result = await (await create()).json();
  assert.equal(result.status, "pending");
  const check = (id: string) =>
    call("auth/signup/email-verifications/check", fixture.jar, "POST", {
      id,
      email: fixture.body.email,
      code: "000000",
    });
  for (let i = 0; i < 20; i++)
    assert.equal((await check(randomUUID())).status, 400);
  assert.equal((await check(result.id)).status, 429);
  await db
    .getRepository(EmailVerification)
    .update({ id: result.id }, { retryAt: new Date(0) });
  const reissued = await (await create()).json();
  assert.equal(
    (await check(reissued.id)).status,
    429,
    "new challenge must retain aggregate checks",
  );
  await db
    .getRepository(EmailVerification)
    .update({ id: reissued.id }, { retryAt: new Date(0) });
  await create();
  assert.equal(
    (await create()).status,
    429,
    "issue limit persists across requests",
  );
});
