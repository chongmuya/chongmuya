import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import type { InquirySnapshot } from "../types/inquiry.js";

@Entity("reservation_requests")
@Index("reservation_requests_event_round", ["eventId", "round"], {
  unique: true,
})
@Index("reservation_requests_event_key", ["eventId", "requestKey"], {
  unique: true,
})
@Index("reservation_requests_active", ["eventId"], {
  unique: true,
  where: "state = 'ACTIVE'",
})
export class ReservationRequest {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "reservation_requests_pkey",
  })
  id!: string;
  @ForeignKey("events", "id", { name: "reservation_requests_event_id_fkey" })
  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;
  @Column({ type: "integer", default: 1 }) round!: number;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) state!:
    "ACTIVE" | "SELECTED" | "CLOSED";
  @Column({ type: "uuid", name: "created_by_id", nullable: true })
  createdById!: string | null;
  @Column({ type: "uuid", name: "current_contact_account_id", nullable: true })
  currentContactAccountId!: string | null;
  @Column({ type: "jsonb", name: "contact_changes", default: [] })
  contactChanges!: {
    handoverId: string;
    from: string;
    to: string;
    name: string;
    at: string;
    actor: string;
  }[];
  @Column({
    type: "varchar",
    length: 100,
    name: "current_contact_name",
    nullable: true,
  })
  currentContactName!: string | null;
  @Column({
    type: "varchar",
    length: 20,
    name: "current_contact_phone",
    nullable: true,
  })
  currentContactPhone!: string | null;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "timestamptz", name: "closed_at", nullable: true })
  closedAt!: Date | null;
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
