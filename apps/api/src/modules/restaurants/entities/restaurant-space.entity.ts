import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";

@Entity("restaurant_spaces")
@Check("restaurant_spaces_kind_check", "kind IN ('HALL','FLOOR','WHOLE')")
@Check(
  "restaurant_spaces_availability_check",
  "availability IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')",
)
@Check(
  "restaurant_spaces_seating_check",
  "together_seating IN ('YES','NO','UNKNOWN')",
)
@Check(
  "restaurant_spaces_numbers_check",
  "(capacity IS NULL OR capacity > 0) AND (min_guests IS NULL OR min_guests >= 0) AND (min_spend IS NULL OR min_spend >= 0) AND (separate_fee IS NULL OR separate_fee >= 0)",
)
export class RestaurantSpace {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "restaurant_spaces_pkey" })
  id!: string;
  @Index("restaurant_spaces_restaurant")
  @ForeignKey("restaurants", "id", {
    name: "restaurant_spaces_restaurant_id_fkey",
  })
  @Column({ type: "uuid", name: "restaurant_id" })
  restaurantId!: string;
  @Column({ type: "varchar", length: 80 }) label!: string;
  @Column({ type: "varchar", length: 10 }) kind!: "HALL" | "FLOOR" | "WHOLE";
  @Column({ type: "varchar", length: 16 }) availability!:
    "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  @Column({ type: "varchar", length: 8, name: "together_seating" })
  togetherSeating!: "YES" | "NO" | "UNKNOWN";
  @Column({ type: "integer", nullable: true }) capacity!: number | null;
  @Column({ type: "integer", name: "min_guests", nullable: true }) minGuests!:
    number | null;
  @Column({ type: "integer", name: "min_spend", nullable: true }) minSpend!:
    number | null;
  @Column({ type: "integer", name: "separate_fee", nullable: true })
  separateFee!: number | null;
  @Column({ type: "text", nullable: true }) conditions!: string | null;
}
