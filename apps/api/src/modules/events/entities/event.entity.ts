import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
@Entity("events")
@Index("events_owner_creation_key", ["creatorId", "creationKey"], {
  unique: true,
})
export class Event {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "events_pkey" })
  id!: string;
  @Index("events_owner")
  @ForeignKey("accounts", "id", { name: "events_owner_id_fkey" })
  @Column({ type: "uuid", name: "owner_id" })
  ownerId!: string;
  // Immutable creator; ownerId is the current manager, changed only by accepted handover.
  @ForeignKey("accounts", "id", { name: "events_creator_id_fkey" })
  @Column({ type: "uuid", name: "creator_id" })
  creatorId!: string;
  @Index("events_group")
  @ForeignKey("groups", "id", { name: "events_group_id_fkey" })
  @Column({ type: "uuid", name: "group_id", nullable: true })
  groupId!: string | null;
  @Column({ type: "uuid", name: "creation_key", nullable: true }) creationKey!:
    string | null;
  @Column({
    type: "varchar",
    length: 64,
    name: "creation_digest",
    nullable: true,
  })
  creationDigest!: string | null;
  @Column({
    type: "boolean",
    name: "reservation_schedule_locked",
    default: false,
  })
  reservationScheduleLocked!: boolean;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "integer", name: "schedule_revision", default: 1 })
  scheduleRevision!: number;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "timestamptz", name: "scheduled_at", nullable: true })
  scheduledAt!: Date | null;
  @Column({
    type: "timestamptz",
    name: "schedule_updated_at",
    default: () => "now()",
  })
  scheduleUpdatedAt!: Date;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
