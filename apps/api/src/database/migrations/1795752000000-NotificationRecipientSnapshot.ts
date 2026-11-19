import type { MigrationInterface, QueryRunner } from "typeorm";
export class NotificationRecipientSnapshot1795752000000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    // Historical recipients cannot safely be inferred from a mutable current link.
    await r.query(
      `ALTER TABLE notification_messages ADD COLUMN contact_id_snapshot uuid`,
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(`LOCK TABLE notification_messages IN ACCESS EXCLUSIVE MODE`);
    const [row] = await r.query(
      `SELECT EXISTS(SELECT 1 FROM notification_messages WHERE contact_id_snapshot IS NOT NULL) AS occupied`,
    );
    if (row.occupied)
      throw new Error("Recipient snapshots require forward recovery.");
    await r.query(
      `ALTER TABLE notification_messages DROP COLUMN contact_id_snapshot`,
    );
  }
}
