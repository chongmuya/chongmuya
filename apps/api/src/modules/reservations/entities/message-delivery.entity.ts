import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";
import type { DeliveryState } from "../types/merchant-reply.js";
@Entity("message_deliveries")
@Index(
  "message_deliveries_logical_unique",
  ["targetId", "purpose", "contactId", "channel"],
  { unique: true },
)
@Check(
  "message_deliveries_status_check",
  "status IN ('PENDING','PROCESSING','ACCEPTED','DELIVERED','FAILED','UNKNOWN','HELD','CANCELLED')",
)
export class MessageDelivery {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("reservation_request_targets", "id")
  @Column({ type: "uuid", name: "target_id" })
  targetId!: string;
  @Column({ type: "varchar", length: 32, default: "NEW_INQUIRY" })
  purpose!: string;
  @Column({ type: "varchar", length: 8, default: "LMS" }) channel!: string;
  @Column({ type: "uuid", name: "contact_id" }) contactId!: string;
  @Column({ type: "varchar", length: 20, name: "phone_snapshot" })
  phoneSnapshot!: string;
  @Column({ type: "integer", name: "link_generation", default: 1 })
  linkGeneration!: number;
  @Column({ type: "integer", name: "template_version", default: 1 })
  templateVersion!: number;
  @Column({ type: "jsonb" }) variables!: {
    restaurantName: string;
    eventName: string;
    startsAt: string;
    expectedGuests: number;
    space: string;
  };
  @Column({ type: "varchar", length: 16, default: "PENDING" })
  status!: DeliveryState;
  @Column({ type: "integer", default: 0 }) attempts!: number;
  @Column({ type: "timestamptz", name: "started_at", nullable: true })
  startedAt!: Date | null;
  @Column({ type: "timestamptz", name: "lease_until", nullable: true })
  leaseUntil!: Date | null;
  @Column({
    type: "varchar",
    length: 100,
    name: "provider_message_id",
    nullable: true,
  })
  providerMessageId!: string | null;
  @Column({
    type: "varchar",
    length: 100,
    name: "provider_group_id",
    nullable: true,
  })
  providerGroupId!: string | null;
  @Column({ type: "varchar", length: 16, nullable: true }) provider!:
    "fake" | "solapi" | null;
  @Column({
    type: "varchar",
    length: 16,
    name: "failure_stage",
    nullable: true,
  })
  failureStage!: "SUBMISSION" | "DELIVERY" | null;
  @Column({ type: "varchar", length: 80, name: "error_code", nullable: true })
  errorCode!: string | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
  @Column({ type: "timestamptz", name: "updated_at" }) updatedAt!: Date;
}
