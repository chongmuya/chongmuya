import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";

// Operations-only data. Never spread this entity into a public response.
@Entity("restaurant_contacts")
@Index("restaurant_contacts_primary", ["restaurantId"], {
  unique: true,
  where: "is_primary",
})
@Index("restaurant_contacts_restaurant", ["restaurantId", "active"])
@Index("restaurant_contacts_id_restaurant", ["id", "restaurantId"], {
  unique: true,
})
export class RestaurantContact {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "restaurant_contacts_pkey",
  })
  id!: string;
  @ForeignKey("restaurants", "id", {
    name: "restaurant_contacts_restaurant_id_fkey",
  })
  @Column({ type: "uuid", name: "restaurant_id" })
  restaurantId!: string;
  @Column({ type: "varchar", length: 80 }) name!: string;
  @Column({ type: "varchar", length: 20 }) phone!: string;
  @Column({ type: "boolean", name: "is_primary", default: false })
  isPrimary!: boolean;
  @Column({ type: "boolean", default: true }) active!: boolean;
  @Column({ type: "timestamptz", name: "request_consent_at", nullable: true })
  requestConsentAt!: Date | null;
  @Column({ type: "text", name: "consent_note", nullable: true }) consentNote!:
    string | null;
}
