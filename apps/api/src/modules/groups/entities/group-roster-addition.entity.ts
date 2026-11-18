import { Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";

// Durable retry receipt. It does not replace or duplicate roster contents.
@Entity("group_roster_additions")
export class GroupRosterAddition {
  @ForeignKey("groups", "id", { name: "group_roster_additions_group_id_fkey" })
  @PrimaryColumn({
    type: "uuid",
    name: "group_id",
    primaryKeyConstraintName: "group_roster_additions_pkey",
  })
  groupId!: string;
  @PrimaryColumn({
    type: "uuid",
    name: "request_key",
    primaryKeyConstraintName: "group_roster_additions_pkey",
  })
  requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "integer", name: "added_count" }) addedCount!: number;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
