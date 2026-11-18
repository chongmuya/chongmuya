import type { MigrationInterface, QueryRunner } from "typeorm";
export class OwnerRestaurants1795392000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE restaurants
      ADD COLUMN owner_account_id uuid REFERENCES accounts(id), ADD COLUMN version integer NOT NULL DEFAULT 1,
      ADD COLUMN branch_name varchar(80), ADD COLUMN base_address varchar(200), ADD COLUMN jibun_address varchar(200),
      ADD COLUMN detail_address varchar(120), ADD COLUMN registration_key varchar(64),
      ADD COLUMN minimum_guests integer CHECK(minimum_guests IS NULL OR minimum_guests >= 0),
      ADD COLUMN policies jsonb CHECK(policies IS NULL OR jsonb_typeof(policies)='object')`);
    await q.query(
      `CREATE UNIQUE INDEX restaurants_registration_key ON restaurants(registration_key)`,
    );
    await q.query(
      `CREATE INDEX restaurants_owner ON restaurants(owner_account_id)`,
    );
    await q.query(
      `ALTER TABLE restaurant_menus ADD COLUMN position integer NOT NULL DEFAULT 0`,
    );
    await q.query(`CREATE TABLE restaurant_drafts (
      id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), slot varchar(36) NOT NULL,
      restaurant_id uuid REFERENCES restaurants(id), version integer NOT NULL DEFAULT 1, step integer NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 5),
      restaurant_version integer, data jsonb NOT NULL, search_results jsonb NOT NULL DEFAULT '[]', selected_address jsonb, verified_contact jsonb, submitted_at timestamptz,
      CONSTRAINT restaurant_drafts_account_slot UNIQUE(account_id, slot))`);
    await q.query(`CREATE TABLE restaurant_operations (
      id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES restaurants(id), action varchar(40) NOT NULL,
      actor varchar(100) NOT NULL, reason varchar(500) NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL)`);
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      `SELECT (SELECT count(*) FROM restaurant_drafts) + (SELECT count(*) FROM restaurant_operations) + (SELECT count(*) FROM restaurants WHERE owner_account_id IS NOT NULL OR policies IS NOT NULL OR registration_key IS NOT NULL) AS count`,
    );
    if (Number(row.count))
      throw new Error(
        "Owner restaurant data exists; rollback requires a preservation plan",
      );
    await q.query(`DROP TABLE restaurant_operations, restaurant_drafts`);
    await q.query(`ALTER TABLE restaurant_menus DROP COLUMN position`);
    await q.query(
      `ALTER TABLE restaurants DROP COLUMN owner_account_id, DROP COLUMN version, DROP COLUMN branch_name, DROP COLUMN base_address, DROP COLUMN jibun_address, DROP COLUMN detail_address, DROP COLUMN registration_key, DROP COLUMN minimum_guests, DROP COLUMN policies`,
    );
  }
}
