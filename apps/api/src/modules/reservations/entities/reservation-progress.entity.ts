import { Column, Entity, ForeignKey, PrimaryColumn, Index } from "typeorm";
import type {
  ReservationPreparation,
  ReservationAudit,
} from "../types/reservation-completion.js";
@Entity("reservation_progress")
export class ReservationProgress {
  @ForeignKey("selected_reservations", "id", {
    name: "reservation_progress_selection_fkey",
  })
  @PrimaryColumn("uuid", {
    name: "reservation_id",
    primaryKeyConstraintName: "reservation_progress_pkey",
  })
  reservationId!: string;
  @Column({ type: "jsonb" }) state!: ReservationPreparation;
}
@Entity("reservation_completion_history")
@Index(
  "reservation_completion_history_command",
  ["reservationId", "requestKey"],
  { unique: true },
)
export class ReservationCompletionHistory {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "reservation_completion_history_pkey",
  })
  id!: string;
  @ForeignKey("selected_reservations", "id", {
    name: "reservation_completion_history_selection_fkey",
  })
  @Column({ type: "uuid", name: "reservation_id" })
  reservationId!: string;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "varchar", length: 40 }) action!: string;
  @Column({ type: "integer" }) version!: number;
  @Column({ type: "jsonb" }) audit!: ReservationAudit;
  @Column({ type: "jsonb" }) snapshot!: ReservationPreparation;
  @Column({ type: "jsonb" }) evidence!: Record<string, unknown>;
}
@Entity("reservation_changes")
@Index("reservation_changes_pending", ["reservationId"], {
  unique: true,
  where: "status IN ('REQUESTED','PROPOSED')",
})
export class ReservationChange {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "reservation_changes_pkey",
  })
  id!: string;
  @ForeignKey("selected_reservations", "id", {
    name: "reservation_changes_selection_fkey",
  })
  @Column({ type: "uuid", name: "reservation_id" })
  reservationId!: string;
  @Column({ type: "varchar", length: 10 }) kind!:
    "CHANGE" | "CANCEL" | "REFUND";
  @Column({ type: "varchar", length: 16 }) subject!: string;
  @Column({ type: "varchar", length: 100 }) reason!: string;
  @Column({ type: "varchar", length: 16 }) status!:
    "REQUESTED" | "PROPOSED" | "APPLIED" | "REJECTED";
  @Column({ type: "jsonb", nullable: true }) proposal!: {
    agreement: ReservationPreparation["agreement"];
    order: ReservationPreparation["order"];
    guidance: ReservationPreparation["guidance"];
    refundExpected: number | null;
    reason: string;
    audit: ReservationAudit;
  } | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
  @Column({ type: "timestamptz", name: "resolved_at", nullable: true })
  resolvedAt!: Date | null;
}
@Entity("reservation_management_links")
export class ReservationManagementLink {
  @ForeignKey("selected_reservations", "id", {
    name: "reservation_management_links_selection_fkey",
  })
  @PrimaryColumn("uuid", {
    name: "reservation_id",
    primaryKeyConstraintName: "reservation_management_links_pkey",
  })
  reservationId!: string;
  @Column({ type: "uuid", name: "contact_id" }) contactId!: string;
  @Column({ type: "varchar", length: 20, name: "phone_snapshot" })
  phoneSnapshot!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "text", name: "encrypted_token" }) encryptedToken!: string;
  @Column({ type: "integer" }) generation!: number;
  @Column({ type: "timestamptz", name: "expires_at" }) expiresAt!: Date;
  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt!: Date | null;
  @Column({ type: "jsonb" }) audit!: ReservationAudit;
}
