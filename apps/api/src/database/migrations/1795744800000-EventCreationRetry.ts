import type { MigrationInterface, QueryRunner } from "typeorm";
export class EventCreationRetry1795744800000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE events ADD COLUMN creation_key uuid, ADD COLUMN creation_digest varchar(64), ADD COLUMN reservation_schedule_locked boolean NOT NULL DEFAULT false;
      CREATE UNIQUE INDEX events_owner_creation_key ON events(owner_id, creation_key);
      UPDATE events SET reservation_schedule_locked = true WHERE id IN (SELECT event_id FROM reservation_requests WHERE closed_at IS NULL);`);
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query("LOCK TABLE events IN ACCESS EXCLUSIVE MODE");
    const [row] = (await r.query(
      "SELECT EXISTS(SELECT 1 FROM events WHERE creation_key IS NOT NULL) AS occupied",
    )) as { occupied: boolean }[];
    if (row?.occupied)
      throw new Error(
        "Event creation receipts must be preserved in a forward migration.",
      );
    await r.query(
      "DROP INDEX events_owner_creation_key; ALTER TABLE events DROP COLUMN creation_key, DROP COLUMN creation_digest, DROP COLUMN reservation_schedule_locked",
    );
  }
}
