import type { MigrationInterface, QueryRunner } from "typeorm";

export class RestaurantPublicPhone1795771200000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    // Do not populate this from restaurant_contacts: those numbers receive private inquiries.
    await r.query(`ALTER TABLE restaurants ADD COLUMN public_phone varchar(20),
      ADD CONSTRAINT restaurants_public_phone_check CHECK (
        public_phone IS NULL OR public_phone ~ '^(0[0-9]{8,11}|1[568][0-9]{6})$'
      )`);
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(`LOCK TABLE restaurants IN ACCESS EXCLUSIVE MODE`);
    const [row] = await r.query(
      `SELECT EXISTS(SELECT 1 FROM restaurants WHERE public_phone IS NOT NULL) AS occupied`,
    );
    if (row.occupied)
      throw new Error(
        "Restaurant public phone records require forward recovery.",
      );
    await r.query(`ALTER TABLE restaurants DROP COLUMN public_phone`);
  }
}
