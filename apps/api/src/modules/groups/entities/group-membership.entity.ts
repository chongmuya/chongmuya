import {
  Column,
  Entity,
  PrimaryColumn,
  ForeignKey,
  Index,
  Check,
  Unique,
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
@Entity("group_invitations")
@Unique("group_invitations_actor_id_request_key_key", ["actorId", "requestKey"])
@Unique("group_invitations_token_hash_key", ["tokenHash"])
@Check(
  "group_invitations_status_check",
  "status IN ('PENDING','ACCEPTED','CANCELLED')",
)
export class GroupInvitation {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("groups", "id", { name: "group_invitations_group_id_fkey" })
  @Column({ type: "uuid", name: "group_id" })
  groupId!: string;
  @ForeignKey("accounts", "id", { name: "group_invitations_actor_id_fkey" })
  @Column({ type: "uuid", name: "actor_id" })
  actorId!: string;
  @ForeignKey("accounts", "id", { name: "group_invitations_target_id_fkey" })
  @Column({ type: "uuid", name: "target_id" })
  targetId!: string;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "varchar", length: 64, name: "token_hash" })
  tokenHash!: string;
  @Column({ type: "varchar", length: 10 }) status!:
    "PENDING" | "ACCEPTED" | "CANCELLED";
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
  @Column({ type: "timestamptz", name: "expires_at" }) expiresAt!: Date;
  @Column({ type: "timestamptz", name: "completed_at", nullable: true })
  completedAt!: Date | null;
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
