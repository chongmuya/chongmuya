import { Column, Entity, PrimaryColumn, Index } from "typeorm";
@Entity("calendar_schedules")
@Index("calendar_schedule_range", ["ownerId", "date"])
@Index("calendar_schedule_creation", ["ownerId", "creationKey"], {
  unique: true,
})
export class CalendarSchedule {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "calendar_schedules_pkey",
  })
  id!: string;
  @Column({ type: "uuid", name: "owner_id" }) ownerId!: string;
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
