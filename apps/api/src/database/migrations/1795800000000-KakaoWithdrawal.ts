import type { MigrationInterface, QueryRunner } from "typeorm";

export class KakaoWithdrawal1795800000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE accounts ADD COLUMN withdrawal_started_at timestamptz;
      CREATE TABLE account_kakao_withdrawal_apps (binding varchar(64) PRIMARY KEY);
      CREATE TABLE account_kakao_withdrawals (
        account_id uuid PRIMARY KEY CONSTRAINT account_kakao_withdrawals_account_fkey REFERENCES accounts(id),
        receipt_hash varchar(64) NOT NULL CONSTRAINT account_kakao_withdrawals_receipt_key UNIQUE,
        opened_at timestamptz NOT NULL,
        unlink_started boolean NOT NULL DEFAULT false,
        lease_id uuid,
        lease_until timestamptz
      );
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query(`
      LOCK TABLE accounts, account_kakao_withdrawals IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM account_kakao_withdrawals) THEN
          RAISE EXCEPTION 'Kakao withdrawals are pending';
        END IF;
      END $$;
      DROP TABLE account_kakao_withdrawals;
      DROP TABLE account_kakao_withdrawal_apps;
      ALTER TABLE accounts DROP COLUMN withdrawal_started_at;
    `);
  }
}
