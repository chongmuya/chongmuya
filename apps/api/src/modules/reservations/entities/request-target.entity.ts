import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";

@Entity("reservation_request_targets")
@Index(
  "reservation_targets_request_restaurant",
  ["requestId", "restaurantId"],
  { unique: true },
)
@Check(
  "reservation_targets_status_check",
  "delivery_status IN ('PENDING','PROCESSING','ACCEPTED','DELIVERED','FAILED','UNKNOWN','HELD','CANCELLED')",
)
export class RequestTarget {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "reservation_request_targets_pkey",
  })
  id!: string;
  @ForeignKey("reservation_requests", "id", {
    name: "reservation_targets_request_id_fkey",
  })
  @Column({ type: "uuid", name: "request_id" })
  requestId!: string;
  @ForeignKey("restaurants", "id", {
    name: "reservation_targets_restaurant_id_fkey",
  })
  @Column({ type: "uuid", name: "restaurant_id" })
  restaurantId!: string;
  @Column({ type: "varchar", length: 100, name: "restaurant_name" })
  restaurantName!: string;
  @Column({ type: "varchar", length: 240 }) address!: string;
  @Column({ type: "boolean", name: "is_demo" }) isDemo!: boolean;
  @Column({ type: "uuid", name: "contact_id" }) contactId!: string;
  @Column({ type: "varchar", length: 80, name: "contact_name" })
  contactName!: string;
  @Column({ type: "varchar", length: 20, name: "contact_phone" })
  contactPhone!: string;
  @Column({ type: "timestamptz", name: "consent_at" }) consentAt!: Date;
  @Index("reservation_targets_delivery")
  @Column({
    type: "varchar",
    length: 16,
    name: "delivery_status",
    default: "PENDING",
  })
  deliveryStatus!: import("../types/merchant-reply.js").DeliveryState;
  @Column({ type: "integer", name: "reply_version", default: 0 })
  replyVersion!: number;
}
