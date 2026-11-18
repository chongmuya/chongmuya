import { Check, Column, Entity, PrimaryColumn, ForeignKey } from "typeorm";
import type { AttendanceAnswer, AttendanceState } from "../types/attendance.js";
@Entity("attendance_responses")
@ForeignKey("attendance_rounds", ["roundId", "eventId"], ["id", "eventId"], {
  name: "attendance_responses_round_id_event_id_fkey",
})
@ForeignKey(
  "event_participants",
  ["participantId", "eventId"],
  ["id", "eventId"],
  { name: "attendance_responses_participant_id_event_id_fkey" },
)
@Check(
  "attendance_responses_self_answer_check",
  "self_answer IS NULL OR self_answer IN ('ATTENDING','ABSENT')",
)
@Check(
  "attendance_responses_manager_override_check",
  "manager_override IS NULL OR manager_override IN ('UNANSWERED','ATTENDING','ABSENT')",
)
export class AttendanceResponse {
  @PrimaryColumn({
    type: "uuid",
    name: "round_id",
    primaryKeyConstraintName: "attendance_responses_pkey",
  })
  roundId!: string;
  @PrimaryColumn({
    type: "uuid",
    name: "participant_id",
    primaryKeyConstraintName: "attendance_responses_pkey",
  })
  participantId!: string;
  @Column({ type: "uuid", name: "event_id" }) eventId!: string;
  @Column({ type: "varchar", length: 16, name: "self_answer", nullable: true })
  selfAnswer!: AttendanceAnswer | null;
  @Column({
    type: "varchar",
    length: 16,
    name: "manager_override",
    nullable: true,
  })
  managerOverride!: AttendanceState | null;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "timestamptz", name: "self_responded_at", nullable: true })
  selfRespondedAt!: Date | null;
  @Column({ type: "timestamptz", name: "overridden_at", nullable: true })
  overriddenAt!: Date | null;
}
