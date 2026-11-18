import type { MigrationInterface, QueryRunner } from "typeorm";

export class DeliveryLinkGenerations1795478400000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE message_deliveries DROP CONSTRAINT message_deliveries_logical_unique,
      ADD CONSTRAINT message_deliveries_logical_unique UNIQUE(target_id,purpose,contact_id,channel,link_generation)`);
  }
  async down(q: QueryRunner) {
    // PostgreSQL refuses rollback if multiple generations exist; never delete delivery history.
    await q.query(`ALTER TABLE message_deliveries DROP CONSTRAINT message_deliveries_logical_unique,
      ADD CONSTRAINT message_deliveries_logical_unique UNIQUE(target_id,purpose,contact_id,channel)`);
  }
}
