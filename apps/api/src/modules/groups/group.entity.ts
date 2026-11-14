import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
@Entity("groups")
export class Group {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "groups_pkey" })
  id!: string;
  @Index("groups_owner")
  @ForeignKey("accounts", "id", { name: "groups_owner_id_fkey" })
  @Column({ type: "uuid", name: "owner_id" })
  ownerId!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
@Entity("events")
export class Event {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "events_pkey" })
  id!: string;
  @Index("events_group")
  @ForeignKey(() => Group, "id", { name: "events_group_id_fkey" })
  @Column({ type: "uuid", name: "group_id" })
  groupId!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "timestamptz", name: "scheduled_at", nullable: true })
  scheduledAt!: Date | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
