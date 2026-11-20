import type { MigrationInterface, QueryRunner } from "typeorm";

export class ReservationSmsPolicy1795774800000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE message_deliveries
      ALTER COLUMN channel DROP DEFAULT, ALTER COLUMN channel DROP NOT NULL,
      DROP CONSTRAINT message_deliveries_logical_unique,
      ADD CONSTRAINT message_deliveries_logical_unique
        UNIQUE(target_id,purpose,contact_id,link_generation)`);
    await q.query(
      `UPDATE message_deliveries SET channel = NULL
        WHERE attempts = 0 AND status IN ('PENDING','HELD','CANCELLED')
          AND provider_message_id IS NULL AND provider_group_id IS NULL`,
    );
    await q.query(
      `ALTER TABLE notification_facts ADD COLUMN sms_policy_version integer`,
    );
    await q.query(
      `ALTER TABLE notification_messages ADD COLUMN channel varchar(8)`,
    );
    await q.query(`UPDATE notification_messages SET channel = 'LMS'
      WHERE status IN ('ACCEPTED','DELIVERED') OR failure_stage = 'DELIVERY'`);
  }

  async down(q: QueryRunner) {
    await q.query(
      `LOCK TABLE notification_facts, notification_messages IN ACCESS EXCLUSIVE MODE`,
    );
    const [row] = await q.query(`SELECT
      EXISTS(SELECT 1 FROM notification_facts WHERE sms_policy_version IS NOT NULL)
      OR EXISTS(SELECT 1 FROM notification_messages WHERE channel = 'SMS') AS occupied`);
    if (row.occupied)
      throw new Error(
        "Reservation SMS policy history requires forward recovery.",
      );
    await q.query(
      `ALTER TABLE notification_facts DROP COLUMN sms_policy_version`,
    );
    await q.query(`ALTER TABLE notification_messages DROP COLUMN channel`);
    await q.query(
      `UPDATE message_deliveries SET channel = 'LMS' WHERE channel IS NULL`,
    );
    await q.query(`ALTER TABLE message_deliveries
      ALTER COLUMN channel SET DEFAULT 'LMS', ALTER COLUMN channel SET NOT NULL,
      DROP CONSTRAINT message_deliveries_logical_unique,
      ADD CONSTRAINT message_deliveries_logical_unique
        UNIQUE(target_id,purpose,contact_id,channel,link_generation)`);
  }
}
