import { Entity, PrimaryColumn } from "typeorm";

// Keep only the ID, even after a contact is deleted. Never retain contact PII.
@Entity("restaurant_contact_seed_receipts")
export class RestaurantContactSeedReceipt {
  @PrimaryColumn("uuid", {
    name: "contact_id",
    primaryKeyConstraintName: "restaurant_contact_seed_receipts_pkey",
  })
  contactId!: string;
}
