import { randomBytes, randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { PhoneVerification } from "../../src/modules/auth/entities/phone-verification.entity.js";
import { tokenHash } from "../../src/modules/auth/utils/token-hash.js";
import {
  signupTerms,
  signupTermsVersion,
} from "../../src/modules/auth/utils/signup-terms.js";

// Test-only precondition for session/resource tests. Actual verification endpoints
// and the upstream adapter are exercised separately in phone-signup/octomo tests.
export async function signupFixture(db: DataSource) {
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
  return {
    jar: `signup-requester=${requester}`,
    id,
    body: {
      accountType: "organizer",
      name: "테스트 이름",
      nickname: "총무",
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
