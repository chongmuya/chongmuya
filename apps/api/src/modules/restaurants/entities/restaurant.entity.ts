import type { RestaurantPolicies } from "../types/registration.js";
import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";

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
@Check("restaurants_space_photos_check", "jsonb_typeof(space_photos)='array'")
export class Restaurant {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "restaurants_pkey" })
  id!: string;
  @ForeignKey("accounts", "id")
  @Column({ type: "uuid", name: "owner_account_id", nullable: true })
  ownerAccountId!: string | null;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "varchar", length: 80, name: "branch_name", nullable: true })
  branchName!: string | null;
  @Column({
    type: "varchar",
    length: 200,
    name: "base_address",
    nullable: true,
  })
  baseAddress!: string | null;
  @Column({
    type: "varchar",
    length: 200,
    name: "jibun_address",
    nullable: true,
  })
  jibunAddress!: string | null;
  @Column({
    type: "varchar",
    length: 120,
    name: "detail_address",
    nullable: true,
  })
  detailAddress!: string | null;
  @Index("restaurants_registration_key", { unique: true })
  @Column({
    type: "varchar",
    length: 64,
    name: "registration_key",
    nullable: true,
  })
  registrationKey!: string | null;
  @Column({ type: "integer", name: "minimum_guests", nullable: true })
  minimumGuests!: number | null;
  @Column({ type: "jsonb", nullable: true })
  policies!: RestaurantPolicies | null;
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
  @Column({ type: "jsonb", name: "space_photos", default: [] })
  spacePhotos!: { path: string; description: string; position: number }[];
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
