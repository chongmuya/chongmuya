import { Column, Entity, PrimaryColumn, Unique, ForeignKey } from "typeorm";
@Entity("attendance_rounds")
@Unique("attendance_rounds_id_event_id_key", ["id", "eventId"])
@Unique("attendance_rounds_event_id_position_key", ["eventId", "position"])
@Unique("attendance_rounds_event_id_request_key_key", ["eventId", "requestKey"])
@Unique("attendance_rounds_share_id_key", ["shareId"])
export class AttendanceRound {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "attendance_rounds_pkey" })
  id!: string;
  @ForeignKey("events", "id", { name: "attendance_rounds_event_id_fkey" })
  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;
  @Column({ type: "varchar", length: 100 }) title!: string;
  @Column({ type: "integer" }) position!: number;
  @Column({ type: "uuid", name: "share_id" })
  shareId!: string;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "timestamptz", name: "closed_at", nullable: true })
  closedAt!: Date | null;
  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt!: Date | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
