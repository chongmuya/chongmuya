import type { MigrationInterface, QueryRunner } from "typeorm";

export class PersonalEvents1794652800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Migration runner executes this in a transaction. The DDL lock also keeps
    // old application writes from slipping between backfill and NOT NULL.
    await runner.query(`ALTER TABLE events ADD COLUMN owner_id uuid;
      UPDATE events e SET owner_id = g.owner_id FROM groups g WHERE e.group_id = g.id;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM events WHERE owner_id IS NULL) THEN
          RAISE EXCEPTION 'Event owner backfill is incomplete';
        END IF;
      END $$;
      ALTER TABLE events ALTER COLUMN owner_id SET NOT NULL;
      ALTER TABLE events ADD CONSTRAINT events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES accounts(id);
      CREATE INDEX events_owner ON events(owner_id);
      ALTER TABLE events ALTER COLUMN group_id DROP NOT NULL;
      ALTER TABLE events ADD COLUMN version integer NOT NULL DEFAULT 1;`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // The old model derives authorization from the group. Reverting would
    // discard independent ownership/version history, even after linking.
    await runner.query(`LOCK TABLE events IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM events e LEFT JOIN groups g ON g.id = e.group_id
          WHERE e.group_id IS NULL OR e.owner_id IS DISTINCT FROM g.owner_id OR e.version <> 1) THEN
          RAISE EXCEPTION 'Personal event data cannot be represented by the previous schema';
        END IF;
      END $$;
      ALTER TABLE events ALTER COLUMN group_id SET NOT NULL;
      ALTER TABLE events DROP COLUMN version;
      DROP INDEX events_owner;
      ALTER TABLE events DROP COLUMN owner_id;`);
  }
}
