import type { MigrationInterface, QueryRunner } from "typeorm";
export class ReminderScheduleRevision1795762000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE events ADD COLUMN schedule_revision integer NOT NULL DEFAULT 1;
UPDATE events SET schedule_revision=version;
ALTER TABLE calendar_schedules ADD COLUMN schedule_revision integer NOT NULL DEFAULT 1, ADD COLUMN schedule_updated_at timestamptz;
UPDATE calendar_schedules SET schedule_revision=version,schedule_updated_at=updated_at;
ALTER TABLE calendar_schedules ALTER COLUMN schedule_updated_at SET NOT NULL;`);
  }
  async down(): Promise<void> {
    throw new Error("Forward-only migration; preserve reminder receipts.");
  }
}
