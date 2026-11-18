import type { MigrationInterface, QueryRunner } from "typeorm";

export class GroupRoster1795046400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE groups ADD COLUMN group_type varchar(40), ADD COLUMN creation_key uuid, ADD COLUMN creation_digest varchar(64);
      CREATE UNIQUE INDEX groups_owner_creation_key ON groups(owner_id, creation_key);
      CREATE TABLE group_members (
        id uuid CONSTRAINT group_members_pkey PRIMARY KEY,
        group_id uuid NOT NULL CONSTRAINT group_members_group_id_fkey REFERENCES groups(id),
        name varchar(100) NOT NULL,
        phone_last4 varchar(4),
        position integer NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT group_members_phone_last4_check CHECK (phone_last4 IS NULL OR phone_last4 ~ '^[0-9]{4}$')
      );
      CREATE INDEX group_members_group ON group_members(group_id);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [result] = (await runner.query(
      `SELECT EXISTS(SELECT 1 FROM group_members) OR EXISTS(SELECT 1 FROM groups WHERE group_type IS NOT NULL OR creation_key IS NOT NULL) AS occupied`,
    )) as { occupied: boolean }[];
    if (result?.occupied)
      throw new Error(
        "GroupRoster rollback requires preserving roster and group registration data in a forward migration.",
      );
    await runner.query(
      `DROP TABLE group_members; DROP INDEX groups_owner_creation_key; ALTER TABLE groups DROP COLUMN group_type, DROP COLUMN creation_key, DROP COLUMN creation_digest;`,
    );
  }
}
