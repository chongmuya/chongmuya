import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  ForeignKey,
  Index,
} from "typeorm";
import type { AttendanceAnswer, ReviewReason } from "../types/attendance.js";
@Entity("attendance_reviews")
@ForeignKey("attendance_rounds", ["roundId", "eventId"], ["id", "eventId"], {
  name: "attendance_reviews_round_id_event_id_fkey",
})
@ForeignKey(
  "event_participants",
  ["participantId", "eventId"],
  ["id", "eventId"],
  { name: "attendance_reviews_participant_id_event_id_fkey" },
)
@Index("attendance_reviews_pending", ["roundId", "name", "phoneLast4"], {
  unique: true,
  where: "status='PENDING'",
})
@Check("attendance_reviews_phone_last4_check", "phone_last4 ~ '^[0-9]{4}$'")
@Check("attendance_reviews_answer_check", "answer IN ('ATTENDING','ABSENT')")
@Check(
  "attendance_reviews_status_check",
  "status IN ('PENDING','LINKED','EXCLUDED')",
)
@Check(
  "attendance_reviews_reason_check",
  "reason IN ('DUPLICATE_IDENTITY','AMBIGUOUS_NAME','NOT_LISTED')",
)
@Check(
  "attendance_reviews_resolution_check",
  "resolution IS NULL OR resolution IN ('KEEP','APPLY','EXCLUDE')",
)
@Index("attendance_reviews_round", ["roundId", "submittedAt"])
export class AttendanceReview {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "attendance_reviews_pkey",
  })
  id!: string;
  @Column({ type: "uuid", name: "event_id" }) eventId!: string;
  @Column({
    type: "uuid",
    name: "round_id",
    primaryKeyConstraintName: "attendance_reviews_pkey",
  })
  roundId!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "varchar", length: 4, name: "phone_last4" })
  phoneLast4!: string;
  @Column({ type: "varchar", length: 16 }) answer!: AttendanceAnswer;
  @Column({ type: "varchar", length: 24 }) reason!: ReviewReason;
  @Column({ type: "varchar", length: 16, default: "PENDING" }) status!:
    "PENDING" | "LINKED" | "EXCLUDED";
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "timestamptz", name: "submitted_at" }) submittedAt!: Date;
  @Column({ type: "uuid", name: "participant_id", nullable: true })
  participantId!: string | null;
  @Column({ type: "timestamptz", name: "processed_at", nullable: true })
  processedAt!: Date | null;
  @Column({ type: "varchar", length: 16, nullable: true }) resolution!:
    "KEEP" | "APPLY" | "EXCLUDE" | null;
}
