import type { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveFavorites1795811000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query("DROP TABLE favorites");
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE favorites (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id),
        group_id uuid REFERENCES groups(id),
        restaurant_id uuid NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX favorites_personal ON favorites (account_id, restaurant_id) WHERE group_id IS NULL;
      CREATE UNIQUE INDEX favorites_group ON favorites (group_id, restaurant_id) WHERE group_id IS NOT NULL;
    `);
  }
}
