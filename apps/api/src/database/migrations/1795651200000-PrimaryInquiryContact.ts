import type { MigrationInterface, QueryRunner } from "typeorm";

export class PrimaryInquiryContact1795651200000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE restaurant_contacts ADD COLUMN is_primary boolean NOT NULL DEFAULT false",
    );
    // A single consenting recipient can keep receiving inquiries. Ambiguous stores need an explicit selection.
    await q.query(`UPDATE restaurant_contacts c SET is_primary=true FROM (
      SELECT restaurant_id FROM restaurant_contacts WHERE active AND request_consent_at IS NOT NULL
      GROUP BY restaurant_id HAVING count(*) = 1
    ) s WHERE c.restaurant_id=s.restaurant_id AND c.active AND c.request_consent_at IS NOT NULL`);
    await q.query(
      "CREATE UNIQUE INDEX restaurant_contacts_primary ON restaurant_contacts(restaurant_id) WHERE is_primary",
    );
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE restaurant_contacts DROP COLUMN is_primary");
  }
}
