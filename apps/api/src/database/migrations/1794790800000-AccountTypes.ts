import type { MigrationInterface, QueryRunner } from "typeorm";

export class AccountTypes1794790800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Existing identities stay untouched; their signup intent is unknown.
    await runner.query(`ALTER TABLE accounts ADD COLUMN account_type varchar(20),
      ADD CONSTRAINT accounts_account_type_check CHECK (account_type IN ('organizer', 'owner'));`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`LOCK TABLE accounts IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM accounts WHERE account_type IS NOT NULL)
        THEN RAISE EXCEPTION 'Account type data cannot be represented by the previous schema'; END IF;
      END $$;
      ALTER TABLE accounts DROP COLUMN account_type;`);
  }
}
