import { ForeignKey, Column, Entity, PrimaryColumn, Index } from "typeorm";
@Entity("calendar_schedules")
@Index("calendar_schedule_range", ["ownerId", "date"])
@Index("calendar_schedule_creation", ["creatorId", "creationKey"], {
  unique: true,
})
export class CalendarSchedule {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "calendar_schedules_pkey",
  })
  id!: string;
  @Column({ type: "uuid", name: "owner_id" }) ownerId!: string;
  // Immutable creator; ownerId is the current manager, changed only by accepted handover.
  @ForeignKey("accounts", "id", { name: "calendar_schedules_creator_id_fkey" })
  @Column({ type: "uuid", name: "creator_id" })
  creatorId!: string;
  @Column({ type: "uuid", name: "group_id", nullable: true }) groupId!:
    string | null;
  @Column({ type: "uuid", name: "creation_key" }) creationKey!: string;
  @Column({ type: "varchar", length: 64, name: "creation_digest" })
  creationDigest!: string;
  @Column({ type: "varchar", length: 100 }) title!: string;
  @Column({ type: "date" }) date!: string;
  @Column({ type: "timestamptz", name: "starts_at", nullable: true })
  startsAt!: Date | null;
  @Column({ type: "varchar", length: 100 }) memo!: string;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "integer", name: "schedule_revision", default: 1 })
  scheduleRevision!: number;
  @Column({ type: "timestamptz", name: "schedule_updated_at" })
  scheduleUpdatedAt!: Date;
  @Column({ type: "timestamptz", name: "updated_at" }) updatedAt!: Date;
  @Column({ type: "timestamptz", name: "deleted_at", nullable: true })
  deletedAt!: Date | null;
}
@Entity("calendar_commands")
export class CalendarCommand {
  @PrimaryColumn("uuid", {
    name: "schedule_id",
    primaryKeyConstraintName: "calendar_commands_pkey",
  })
  scheduleId!: string;
  @PrimaryColumn("uuid", {
    name: "request_key",
    primaryKeyConstraintName: "calendar_commands_pkey",
  })
  requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "jsonb" }) snapshot!: CalendarSchedule;
}
