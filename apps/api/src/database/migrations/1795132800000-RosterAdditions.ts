import type { MigrationInterface, QueryRunner } from "typeorm";

export class RosterAdditions1795132800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE group_members ADD COLUMN label varchar(40);
      CREATE TABLE group_roster_additions (
        group_id uuid NOT NULL CONSTRAINT group_roster_additions_group_id_fkey REFERENCES groups(id),
        request_key uuid NOT NULL,
        digest varchar(64) NOT NULL,
        added_count integer NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT group_roster_additions_pkey PRIMARY KEY (group_id, request_key)
      );
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE group_members, group_roster_additions IN ACCESS EXCLUSIVE MODE",
    );
    const [result] = (await runner.query(
      `SELECT EXISTS(SELECT 1 FROM group_members WHERE label IS NOT NULL) OR EXISTS(SELECT 1 FROM group_roster_additions) AS occupied`,
    )) as { occupied: boolean }[];
    if (result?.occupied)
      throw new Error(
        "RosterAdditions rollback requires preserving labels and retry receipts in a forward migration.",
      );
    await runner.query(
      `DROP TABLE group_roster_additions; ALTER TABLE group_members DROP COLUMN label;`,
    );
  }
}
