import type { MigrationInterface, QueryRunner } from "typeorm";
export class EmailVerification1794873600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE email_verifications (
      requester_hash varchar(64) PRIMARY KEY, id uuid UNIQUE NOT NULL, email varchar(254) NOT NULL,
      purpose varchar(20) NOT NULL CHECK (purpose = 'signup'), code_hash varchar(64) NOT NULL,
      delivery varchar(10) NOT NULL CHECK (delivery IN ('sending', 'sent', 'failed')),
      created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, retry_at timestamptz NOT NULL,
      failures integer NOT NULL CHECK (failures >= 0 AND failures <= 5),
      verified_at timestamptz, consumed_at timestamptz, cancelled_at timestamptz);
      CREATE INDEX email_verifications_expiry ON email_verifications (expires_at);`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`LOCK TABLE email_verifications IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM email_verifications)
        THEN RAISE EXCEPTION 'Email verification records cannot be represented by the previous schema'; END IF; END $$;
      DROP TABLE email_verifications;`);
  }
}
