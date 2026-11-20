import type { MigrationInterface, QueryRunner } from "typeorm";
export class NotificationHeldIntent1795764000000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      `ALTER TABLE notification_facts ADD COLUMN merchant_hold jsonb`,
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(`LOCK TABLE notification_facts IN ACCESS EXCLUSIVE MODE`);
    const [row] = await r.query(
      `SELECT EXISTS(SELECT 1 FROM notification_facts WHERE merchant_hold IS NOT NULL) AS occupied`,
    );
    if (row.occupied)
      throw new Error("Held notification intents require forward recovery.");
    await r.query(`ALTER TABLE notification_facts DROP COLUMN merchant_hold`);
  }
}
