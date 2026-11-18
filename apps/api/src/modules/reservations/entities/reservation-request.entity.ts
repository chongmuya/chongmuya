import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import type { InquirySnapshot } from "../types/inquiry.js";

@Entity("reservation_requests")
@Index("reservation_requests_event_unique", ["eventId"], { unique: true })
export class ReservationRequest {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "reservation_requests_pkey",
  })
  id!: string;
  @ForeignKey("events", "id", { name: "reservation_requests_event_id_fkey" })
  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "jsonb" }) snapshot!: InquirySnapshot;
  @Column({ type: "varchar", length: 80, name: "contact_name" })
  contactName!: string;
  @Column({ type: "varchar", length: 20, name: "contact_phone" })
  contactPhone!: string;
  @Column({
    type: "timestamptz",
    name: "contact_phone_verified_at",
    nullable: true,
  })
  contactPhoneVerifiedAt!: Date | null;
  @Index("reservation_requests_created")
  @Column({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;
}
