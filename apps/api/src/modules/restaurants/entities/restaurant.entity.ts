import { Check, Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("restaurants")
@Index("restaurants_public_region", ["published", "region"])
@Check(
  "restaurants_capacity_check",
  '"max_capacity" IS NULL OR "max_capacity" > 0',
)
@Check(
  "restaurants_coordinates_check",
  "(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)",
)
export class Restaurant {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "restaurants_pkey" })
  id!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "varchar", length: 240 }) address!: string;
  @Column({ type: "varchar", length: 80 }) region!: string;
  @Column({ type: "varchar", length: 40, nullable: true }) category!:
    string | null;
  @Column({ type: "double precision", nullable: true }) latitude!:
    number | null;
  @Column({ type: "double precision", nullable: true }) longitude!:
    number | null;
  @Column({ type: "integer", name: "max_capacity", nullable: true })
  maxCapacity!: number | null;
  @Column({ type: "varchar", length: 500, name: "photo_path", nullable: true })
  photoPath!: string | null;
  @Column({ type: "text", name: "operating_hours", nullable: true })
  operatingHours!: string | null;
  @Column({ type: "text", nullable: true }) facilities!: string | null;
  @Column({ type: "text", name: "booking_policy", nullable: true })
  bookingPolicy!: string | null;
  @Column({ type: "text", name: "deposit_policy", nullable: true })
  depositPolicy!: string | null;
  @Column({ type: "text", name: "menu_policy", nullable: true }) menuPolicy!:
    string | null;
  @Column({ type: "text", name: "cancellation_policy", nullable: true })
  cancellationPolicy!: string | null;
  @Column({ type: "boolean", default: false }) published!: boolean;
  @Column({ type: "boolean", name: "is_demo", default: false })
  isDemo!: boolean;
  @Column({ type: "timestamptz", name: "verified_at", nullable: true })
  verifiedAt!: Date | null;
}
