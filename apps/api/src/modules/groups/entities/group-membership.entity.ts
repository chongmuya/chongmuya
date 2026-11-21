import {
  Column,
  Entity,
  PrimaryColumn,
  ForeignKey,
  Index,
  Check,
} from "typeorm";
@Entity("group_memberships")
@Index("group_one_admin", ["groupId"], {
  unique: true,
  where: "role = 'ADMIN'",
})
@Check("group_memberships_role_check", "role IN ('ADMIN','MEMBER')")
export class GroupMembership {
  @ForeignKey("groups", "id", { name: "group_memberships_group_id_fkey" })
  @PrimaryColumn("uuid", { name: "group_id" })
  groupId!: string;
  @ForeignKey("accounts", "id", { name: "group_memberships_account_id_fkey" })
  @PrimaryColumn("uuid", { name: "account_id" })
  accountId!: string;
  @Column({ type: "varchar", length: 10 }) role!: "ADMIN" | "MEMBER";
  @Column({ type: "timestamptz", name: "joined_at" }) joinedAt!: Date;
}
@Entity("group_roster_edits")
export class GroupRosterEdit {
  @ForeignKey("groups", "id", { name: "group_roster_edits_group_id_fkey" })
  @PrimaryColumn("uuid", { name: "group_id" })
  groupId!: string;
  @ForeignKey("accounts", "id", { name: "group_roster_edits_actor_id_fkey" })
  @PrimaryColumn("uuid", { name: "actor_id" })
  actorId!: string;
  @PrimaryColumn("uuid", { name: "request_key" }) requestKey!: string;
  @ForeignKey("group_members", "id", {
    name: "group_roster_edits_member_id_fkey",
  })
  @Column({ type: "uuid", name: "member_id" })
  memberId!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "jsonb", name: "before_snapshot" }) beforeSnapshot!: object;
  @Column({ type: "jsonb", name: "after_snapshot" }) afterSnapshot!: object;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
