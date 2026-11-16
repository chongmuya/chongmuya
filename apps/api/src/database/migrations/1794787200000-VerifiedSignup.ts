import type { MigrationInterface, QueryRunner } from "typeorm";

export class VerifiedSignup1794787200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE accounts ADD COLUMN name varchar(100), ADD COLUMN nickname varchar(100),
        ADD COLUMN phone varchar(11), ADD COLUMN phone_verified_at timestamptz,
        ADD COLUMN email_verified_at timestamptz;
      CREATE TABLE account_consents (
        account_id uuid NOT NULL REFERENCES accounts(id), term_id varchar(40) NOT NULL,
        version varchar(64) NOT NULL, accepted boolean NOT NULL, recorded_at timestamptz NOT NULL,
        PRIMARY KEY (account_id, term_id)
      );
      CREATE TABLE phone_verifications (
        requester_hash varchar(64) PRIMARY KEY, id uuid UNIQUE NOT NULL,
        phone varchar(11) NOT NULL, purpose varchar(20) NOT NULL CHECK (purpose = 'signup'),
        created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, retry_at timestamptz NOT NULL,
        next_check_at timestamptz NOT NULL, check_count integer NOT NULL CHECK (check_count >= 0),
        verified_at timestamptz, consumed_at timestamptz, cancelled_at timestamptz
      );
      CREATE INDEX phone_verifications_expiry ON phone_verifications (expires_at);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    // Refuse to silently discard profile, consent or verification records.
    await runner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM accounts WHERE name IS NOT NULL OR nickname IS NOT NULL OR phone IS NOT NULL
        OR phone_verified_at IS NOT NULL OR email_verified_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM account_consents) OR EXISTS (SELECT 1 FROM phone_verifications)
      THEN RAISE EXCEPTION 'Verified signup data cannot be represented by the previous schema'; END IF;
    END $$`);
    await runner.query(`DROP TABLE account_consents, phone_verifications;
      ALTER TABLE accounts DROP COLUMN name, DROP COLUMN nickname, DROP COLUMN phone,
        DROP COLUMN phone_verified_at, DROP COLUMN email_verified_at;`);
  }
}
