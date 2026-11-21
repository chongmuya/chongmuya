import type { MigrationInterface, QueryRunner } from "typeorm";

export class AccountWithdrawal1795778400000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE accounts ADD COLUMN withdrawn_at timestamptz,
        ADD COLUMN withdrawal_receipt_hash varchar(64);
      CREATE UNIQUE INDEX accounts_withdrawal_receipt_hash
        ON accounts (withdrawal_receipt_hash);
      CREATE TABLE account_withdrawal_requests (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL CONSTRAINT account_withdrawal_account_fkey REFERENCES accounts(id),
        blockers text[] NOT NULL,
        opened_at timestamptz NOT NULL,
        resolved_at timestamptz,
        resolution varchar(12),
        reviewed_by varchar(80),
        CONSTRAINT account_withdrawal_resolution_check CHECK (
          (resolved_at IS NULL AND resolution IS NULL AND reviewed_by IS NULL)
          OR (resolved_at IS NOT NULL AND resolution IS NOT DISTINCT FROM 'REVIEWED' AND reviewed_by IS NOT NULL)
          OR (resolved_at IS NOT NULL AND resolution IS NOT DISTINCT FROM 'WITHDRAWN' AND reviewed_by IS NULL)
        )
      );
      CREATE UNIQUE INDEX account_withdrawal_pending ON account_withdrawal_requests (account_id)
        WHERE resolved_at IS NULL;
      CREATE TABLE account_withdrawal_request_keys (
        account_id uuid NOT NULL,
        request_key uuid NOT NULL,
        request_id uuid NOT NULL CONSTRAINT account_withdrawal_request_keys_request_fkey
          REFERENCES account_withdrawal_requests(id),
        PRIMARY KEY (account_id, request_key)
      );
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query(`
      LOCK TABLE accounts, account_withdrawal_requests IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM accounts WHERE withdrawn_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM account_withdrawal_requests) THEN
          RAISE EXCEPTION 'Withdrawal records exist';
        END IF;
      END $$;
      DROP TABLE account_withdrawal_request_keys;
      DROP TABLE account_withdrawal_requests;
      ALTER TABLE accounts DROP COLUMN withdrawal_receipt_hash, DROP COLUMN withdrawn_at;
    `);
  }
}
