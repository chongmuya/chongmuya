import type { MigrationInterface, QueryRunner } from "typeorm";
export class GroupEvents1793664000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE groups (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id), name varchar(100) NOT NULL, created_at timestamptz NOT NULL);
      CREATE INDEX groups_owner ON groups(owner_id);
      CREATE TABLE events (id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES groups(id), name varchar(100) NOT NULL, scheduled_at timestamptz, created_at timestamptz NOT NULL);
      CREATE INDEX events_group ON events(group_id);`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query("DROP TABLE events, groups");
  }
}
