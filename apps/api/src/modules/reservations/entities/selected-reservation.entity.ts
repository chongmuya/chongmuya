import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import type { ReplySnapshot } from "../types/merchant-reply.js";
@Entity("selected_reservations")
@Index("selected_reservations_event_active", ["eventId"], {
  unique: true,
  where: "cancelled_at IS NULL",
})
@Index("selected_reservations_request", ["requestId"], { unique: true })
export class SelectedReservation {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "selected_reservations_pkey",
  })
  id!: string;
  @ForeignKey("events", "id", { name: "selected_reservations_event_fkey" })
  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;
  @ForeignKey("reservation_requests", "id", {
    name: "selected_reservations_request_fkey",
  })
  @Column({ type: "uuid", name: "request_id" })
  requestId!: string;
  @ForeignKey("reservation_request_targets", "id", {
    name: "selected_reservations_target_fkey",
  })
  @Column({ type: "uuid", name: "target_id" })
  targetId!: string;
  @Column({ type: "integer" }) revision!: number;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "varchar", length: 24, default: "PREPARING" })
  status!: "PREPARING" | "CONFIRMED" | "CHECK_REQUIRED" | "CANCELLED";
  @Column({ type: "jsonb" }) snapshot!: ReplySnapshot;
  @Column({ type: "uuid", name: "selected_by" }) selectedBy!: string;
  @Column({ type: "timestamptz", name: "selected_at" }) selectedAt!: Date;
  @Column({ type: "timestamptz", name: "cancelled_at", nullable: true })
  cancelledAt!: Date | null;
}
@Entity("reservation_decisions")
export class ReservationDecision {
  @ForeignKey("reservation_requests", "id", {
    name: "reservation_decisions_request_fkey",
  })
  @PrimaryColumn("uuid", {
    name: "request_id",
    primaryKeyConstraintName: "reservation_decisions_pkey",
  })
  requestId!: string;
  @PrimaryColumn("uuid", {
    name: "request_key",
    primaryKeyConstraintName: "reservation_decisions_pkey",
  })
  requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "uuid", name: "target_id" }) targetId!: string;
  @Column({ type: "varchar", length: 16 }) action!: "SELECT" | "DECLINE";
  @Column({ type: "uuid", name: "actor_id" }) actorId!: string;
  @Column({ type: "integer" }) revision!: number;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
