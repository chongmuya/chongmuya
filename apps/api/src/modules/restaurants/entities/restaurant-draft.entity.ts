import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Unique,
  PrimaryColumn,
} from "typeorm";
import type {
  RegistrationData,
  VerifiedAddress,
} from "../types/registration.js";
@Entity("restaurant_drafts")
@Unique("restaurant_drafts_account_slot", ["accountId", "slot"])
@Check("restaurant_drafts_step_check", "step BETWEEN 0 AND 5")
export class RestaurantDraft {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("accounts", "id", { name: "restaurant_drafts_account_id_fkey" })
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;
  @Column({ type: "varchar", length: 36 }) slot!: string;
  @ForeignKey("restaurants", "id", {
    name: "restaurant_drafts_restaurant_id_fkey",
  })
  @Column({ type: "uuid", name: "restaurant_id", nullable: true })
  restaurantId!: string | null;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "integer", default: 0 }) step!: number;
  @Column({ type: "integer", name: "restaurant_version", nullable: true })
  restaurantVersion!: number | null;
  @Column({ type: "jsonb" }) data!: RegistrationData;
  @Column({ type: "jsonb", name: "search_results", default: [] })
  searchResults!: VerifiedAddress[];
  @Column({ type: "jsonb", name: "selected_address", nullable: true })
  selectedAddress!: VerifiedAddress | null;
  @Column({ type: "jsonb", name: "verified_contact", nullable: true })
  verifiedContact!: { phone: string; verifiedAt: string } | null;
  @Column({ type: "timestamptz", name: "submitted_at", nullable: true })
  submittedAt!: Date | null;
}
