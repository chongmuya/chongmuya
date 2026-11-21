import type { MigrationInterface, QueryRunner } from "typeorm";

export class RequestLimitExpiry1795815000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'CREATE INDEX auth_attempts_expiry ON auth_attempts ("resetsAt")',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query("DROP INDEX auth_attempts_expiry");
  }
}
