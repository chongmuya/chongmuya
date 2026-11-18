import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Unique,
  PrimaryColumn,
} from "typeorm";
import type { ReplyActor, ReplySnapshot } from "../types/merchant-reply.js";
@Entity("merchant_reply_revisions")
@Unique("merchant_reply_revision_unique", ["targetId", "revision"])
@Unique("merchant_reply_key_unique", ["targetId", "requestKey"])
@Check("merchant_reply_revisions_revision_check", "revision > 0")
@Check(
  "merchant_reply_revisions_kind_check",
  "kind IN ('AVAILABLE','CHANGE','DECLINE')",
)
export class MerchantReplyRevision {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("reservation_request_targets", "id", {
    name: "merchant_reply_revisions_target_id_fkey",
  })
  @Column({ type: "uuid", name: "target_id" })
  targetId!: string;
  @Column({ type: "integer" }) revision!: number;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "varchar", length: 16 }) kind!:
    "AVAILABLE" | "CHANGE" | "DECLINE";
  @Column({ type: "jsonb" }) snapshot!: ReplySnapshot;
  @Column({ type: "varchar", length: 1000 }) reason!: string;
  @Column({ type: "timestamptz", name: "expires_at", nullable: true })
  expiresAt!: Date | null;
  @Column({ type: "jsonb" }) actor!: ReplyActor;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
@Entity("reservation_operations")
export class ReservationOperation {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("reservation_request_targets", "id", {
    name: "reservation_operations_target_id_fkey",
  })
  @Column({ type: "uuid", name: "target_id" })
  targetId!: string;
  @Column({ type: "varchar", length: 40 }) action!: string;
  @Column({ type: "varchar", length: 100 }) actor!: string;
  @Column({ type: "varchar", length: 500 }) reason!: string;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
@Entity("message_delivery_reports")
export class MessageDeliveryReport {
  @PrimaryColumn({ type: "varchar", length: 64 }) digest!: string;
  @ForeignKey("message_deliveries", "id", {
    name: "message_delivery_reports_delivery_id_fkey",
  })
  @Column({ type: "uuid", name: "delivery_id" })
  deliveryId!: string;
  @Column({ type: "varchar", length: 100, name: "message_id" })
  messageId!: string;
  @Column({ type: "varchar", length: 12, name: "status_code" })
  statusCode!: string;
  @Column({ type: "timestamptz", name: "received_at" }) receivedAt!: Date;
}
