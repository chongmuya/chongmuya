import {
  Column,
  Entity,
  PrimaryColumn,
  Index,
  ForeignKey,
  Unique,
  Check,
} from "typeorm";
@Entity("event_participants")
@Unique("event_participants_event_id_group_member_id_key", [
  "eventId",
  "groupMemberId",
])
@Unique("event_participants_id_event_id_key", ["id", "eventId"])
@Index("event_participants_event", ["eventId"])
@Check(
  "event_participants_phone_last4_check",
  "phone_last4 IS NULL OR phone_last4 ~ '^[0-9]{4}$'",
)
export class EventParticipant {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "event_participants_pkey",
  })
  id!: string;
  @ForeignKey("events", "id", { name: "event_participants_event_id_fkey" })
  @Column({ type: "uuid", name: "event_id" })
  eventId!: string;
  @ForeignKey("group_members", "id", {
    name: "event_participants_group_member_id_fkey",
  })
  @Column({ type: "uuid", name: "group_member_id", nullable: true })
  groupMemberId!: string | null;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "varchar", length: 4, name: "phone_last4", nullable: true })
  phoneLast4!: string | null;
  @Column({ type: "varchar", length: 40, nullable: true }) label!:
    string | null;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "integer", name: "identity_version", default: 1 })
  identityVersion!: number;
  @Column({ type: "integer" }) position!: number;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
