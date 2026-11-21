import type { MigrationInterface, QueryRunner } from "typeorm";

export class OwnerDepositAccount1795812000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      "ALTER TABLE accounts ADD COLUMN owner_deposit_account jsonb",
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "ALTER TABLE accounts DROP COLUMN owner_deposit_account",
    );
  }
}
