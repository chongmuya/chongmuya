import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
@Entity("events")
@Index("events_owner_creation_key", ["ownerId", "creationKey"], {
  unique: true,
})
export class Event {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "events_pkey" })
  id!: string;
  @Index("events_owner")
  @ForeignKey("accounts", "id", { name: "events_owner_id_fkey" })
  @Column({ type: "uuid", name: "owner_id" })
  ownerId!: string;
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
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "timestamptz", name: "scheduled_at", nullable: true })
  scheduledAt!: Date | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
