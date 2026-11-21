import { Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";

@Entity("attendance_round_exclusions")
@ForeignKey("attendance_rounds", ["roundId", "eventId"], ["id", "eventId"], {
  name: "attendance_round_exclusions_round_fkey",
  onDelete: "CASCADE",
})
@ForeignKey(
  "event_participants",
  ["participantId", "eventId"],
  ["id", "eventId"],
  {
    name: "attendance_round_exclusions_participant_fkey",
    onDelete: "CASCADE",
  },
)
export class AttendanceRoundExclusion {
  @PrimaryColumn({
    type: "uuid",
    name: "round_id",
    primaryKeyConstraintName: "attendance_round_exclusions_pkey",
  })
  roundId!: string;
  @PrimaryColumn({
    type: "uuid",
    name: "participant_id",
    primaryKeyConstraintName: "attendance_round_exclusions_pkey",
  })
  participantId!: string;
  @Column({ type: "uuid", name: "event_id" }) eventId!: string;
}
