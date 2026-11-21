import { randomBytes, randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { EmailVerification } from "../../src/modules/auth/entities/email-verification.entity.js";
import { PhoneVerification } from "../../src/modules/auth/entities/phone-verification.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
import {
  signupTerms,
  signupTermsVersion,
} from "../../src/modules/auth/utils/signup-terms.js";

export const legacyPolicyConsent = {
  id: "privacyPolicy",
  version: "old-policy-version",
  accepted: false,
} as const;

// Test-only precondition for session/resource tests. Actual verification endpoints
// and the upstream adapter are exercised separately in phone-signup/octomo tests.
export async function signupFixture(
  db: DataSource,
  email = `${randomUUID()}@example.test`,
) {
  const requester = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await db.getRepository(PhoneVerification).insert({
    requesterHash: tokenHash(requester),
    id,
    phone: "01012345678",
    purpose: "signup",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300_000),
    retryAt: new Date(),
    nextCheckAt: new Date(),
    checkCount: 1,
    verifiedAt: new Date(),
    consumedAt: null,
    cancelledAt: null,
  });
  const emailVerificationId = randomUUID();
  await verifiedEmailFixture(
    db,
    email,
    tokenHash(requester),
    emailVerificationId,
  );
  return {
    jar: `signup-requester=${requester}`,
    id,
    body: {
      email,
      emailVerificationId,
      name: "테스트 이름",
      phone: "01012345678",
      phoneVerificationId: id,
      consents: signupTerms.map((term) => ({
        id: term.id,
        version: signupTermsVersion,
        accepted: term.required,
      })),
    },
  };
}

export async function verifiedEmailFixture(
  db: DataSource,
  email: string,
  requesterHash: string,
  id: string = randomUUID(),
) {
  await db.getRepository(EmailVerification).save({
    requesterHash,
    id,
    email,
    purpose: "signup",
    codeHash: "0".repeat(64),
    delivery: "sent",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 600000),
    retryAt: new Date(),
    failures: 0,
    verifiedAt: new Date(),
    consumedAt: null,
    cancelledAt: null,
  });
  return id;
}
