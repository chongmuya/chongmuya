import type { MigrationInterface, QueryRunner } from "typeorm";
export class RestaurantPhotosAndContactHistory1795302000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      "ALTER TABLE restaurants ADD COLUMN space_photos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(space_photos)='array')",
    );
    // This is a historical recipient ID, not a live-contact relationship. Keep the
    // original ID/phone/consent snapshot even after the live contact is deleted.
    await runner.query(
      "ALTER TABLE reservation_request_targets DROP CONSTRAINT reservation_targets_contact_fkey",
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE restaurants, restaurant_contacts, reservation_request_targets IN ACCESS EXCLUSIVE MODE",
    );
    const [row] = (await runner.query(
      "SELECT EXISTS(SELECT 1 FROM restaurants WHERE space_photos <> '[]'::jsonb) OR EXISTS(SELECT 1 FROM reservation_request_targets t LEFT JOIN restaurant_contacts c ON c.id=t.contact_id AND c.restaurant_id=t.restaurant_id WHERE c.id IS NULL) AS occupied",
    )) as { occupied: boolean }[];
    if (row?.occupied)
      throw new Error(
        "RestaurantPhotosAndContactHistory rollback requires a forward migration preserving photo and contact history.",
      );
    await runner.query(
      "ALTER TABLE reservation_request_targets ADD CONSTRAINT reservation_targets_contact_fkey FOREIGN KEY(contact_id,restaurant_id) REFERENCES restaurant_contacts(id,restaurant_id)",
    );
    await runner.query("ALTER TABLE restaurants DROP COLUMN space_photos");
  }
}
