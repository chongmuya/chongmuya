import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
@Entity("events")
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
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "timestamptz", name: "scheduled_at", nullable: true })
  scheduledAt!: Date | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
