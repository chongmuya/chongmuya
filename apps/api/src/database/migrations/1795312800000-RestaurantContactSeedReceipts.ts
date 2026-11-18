import type { MigrationInterface, QueryRunner } from "typeorm";

export class RestaurantContactSeedReceipts1795312800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE restaurant_contact_seed_receipts (
        contact_id uuid CONSTRAINT restaurant_contact_seed_receipts_pkey PRIMARY KEY
      );
      INSERT INTO restaurant_contact_seed_receipts (contact_id)
        SELECT id FROM restaurant_contacts
        UNION
        SELECT contact_id FROM reservation_request_targets WHERE contact_id IS NOT NULL;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE restaurant_contact_seed_receipts IN ACCESS EXCLUSIVE MODE",
    );
    const [result] = (await runner.query(
      "SELECT EXISTS(SELECT 1 FROM restaurant_contact_seed_receipts) AS occupied",
    )) as { occupied: boolean }[];
    if (result?.occupied)
      throw new Error(
        "Contact seed receipts require a forward migration preserving deleted contacts.",
      );
    await runner.query("DROP TABLE restaurant_contact_seed_receipts");
  }
}
