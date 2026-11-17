import type { MigrationInterface, QueryRunner } from "typeorm";
export class PasswordResetKakao1794960000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'CREATE TABLE "external_identities" ("issuer" character varying(100) NOT NULL, "sub" character varying(255) NOT NULL, "accountId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "external_identity_account_issuer" UNIQUE ("accountId", "issuer"), CONSTRAINT "PK_c8648ab5b1ede1d015e47a570d0" PRIMARY KEY ("issuer", "sub"))',
    );
    await runner.query(
      'CREATE TABLE "password_resets" ("hash" character varying(64) NOT NULL, "accountId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "invalidatedAt" TIMESTAMP WITH TIME ZONE, "delivery" character varying(10) NOT NULL, CONSTRAINT "PK_d3588698a427ed900cef7a01f7f" PRIMARY KEY ("hash"))',
    );
    await runner.query(
      'CREATE INDEX "password_resets_account" ON "password_resets"  ("accountId") ',
    );
    await runner.query(
      'CREATE INDEX "password_resets_expiry" ON "password_resets"  ("expiresAt") ',
    );
    await runner.query(
      'CREATE TABLE "kakao_attempts" ("browserHash" character varying(64) NOT NULL, "id" uuid NOT NULL, "stateHash" character varying(64) NOT NULL, "verifier" text NOT NULL, "nonce" text NOT NULL, "purpose" character varying(10) NOT NULL, "status" character varying(12) NOT NULL, "accountId" uuid, "sessionId" uuid, "reauthenticatedAt" TIMESTAMP WITH TIME ZONE, "consentAt" TIMESTAMP WITH TIME ZONE, "issuer" character varying(100), "sub" character varying(255), "email" character varying(254), "emailVerifiedAt" TIMESTAMP WITH TIME ZONE, "errorCode" character varying(40), "next" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "kakao_attempts_id_key" UNIQUE ("id"), CONSTRAINT "PK_3c885a6e4c34cdb1e5a7c346910" PRIMARY KEY ("browserHash"))',
    );
    await runner.query(
      'CREATE INDEX "kakao_attempts_expiry" ON "kakao_attempts"  ("expiresAt") ',
    );
    await runner.query(
      'ALTER TABLE "accounts" ADD "email_verification_source" character varying(20)',
    );
    await runner.query(
      'ALTER TABLE "accounts" ADD "credentials_changed_at" TIMESTAMP WITH TIME ZONE',
    );
    await runner.query(
      'ALTER TABLE "accounts" ALTER COLUMN "passwordHash" DROP NOT NULL',
    );
    await runner.query(
      'ALTER TABLE "external_identities" ADD CONSTRAINT "external_identity_account_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await runner.query(
      'ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_account_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await runner.query(
      'ALTER TABLE "kakao_attempts" ADD CONSTRAINT "kakao_attempts_account_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await runner.query(
      'ALTER TABLE "kakao_attempts" ADD CONSTRAINT "kakao_attempts_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`LOCK TABLE accounts, external_identities, password_resets, kakao_attempts IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM accounts WHERE "passwordHash" IS NULL OR email_verification_source IS NOT NULL OR credentials_changed_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM external_identities) OR EXISTS (SELECT 1 FROM password_resets) OR EXISTS (SELECT 1 FROM kakao_attempts)
        THEN RAISE EXCEPTION 'Authentication records cannot be represented by the previous schema'; END IF; END $$;
      DROP TABLE kakao_attempts;
      DROP TABLE password_resets;
      DROP TABLE external_identities;
      ALTER TABLE accounts ALTER COLUMN "passwordHash" SET NOT NULL;
      ALTER TABLE accounts DROP COLUMN email_verification_source;
      ALTER TABLE accounts DROP COLUMN credentials_changed_at;`);
  }
}
