import {
  Column,
  Entity,
  PrimaryColumn,
  ForeignKey,
  Index,
  Check,
  Unique,
} from "typeorm";
@Entity("group_handovers")
@Index("group_one_handover", ["groupId"], {
  unique: true,
  where: "status = 'PENDING'",
})
@Unique("group_handovers_from_id_request_key_key", ["fromId", "requestKey"])
@Unique("group_handovers_token_hash_key", ["tokenHash"])
@Check(
  "group_handovers_status_check",
  "status IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')",
)
export class GroupHandover {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("groups", "id", { name: "group_handovers_group_id_fkey" })
  @Column({ type: "uuid", name: "group_id" })
  groupId!: string;
  @ForeignKey("accounts", "id", { name: "group_handovers_from_id_fkey" })
  @Column({ type: "uuid", name: "from_id" })
  fromId!: string;
  @ForeignKey("accounts", "id", { name: "group_handovers_to_id_fkey" })
  @Column({ type: "uuid", name: "to_id" })
  toId!: string;
  @Column({ type: "integer", name: "group_version" }) groupVersion!: number;
  @Column({ type: "uuid", name: "request_key" }) requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "varchar", length: 64, name: "token_hash" })
  tokenHash!: string;
  @Column({ type: "varchar", length: 10 }) status!:
    "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
  @Column({ type: "timestamptz", name: "expires_at" }) expiresAt!: Date;
  @Column({ type: "timestamptz", name: "completed_at", nullable: true })
  completedAt!: Date | null;
  @ForeignKey("accounts", "id", { name: "group_handovers_accepted_by_fkey" })
  @Column({ type: "uuid", name: "accepted_by", nullable: true })
  acceptedBy!: string | null;
  @Column({ type: "uuid", name: "accept_key", nullable: true }) acceptKey!:
    string | null;
  @Column({
    type: "varchar",
    length: 64,
    name: "accept_digest",
    nullable: true,
  })
  acceptDigest!: string | null;
  @Column({ type: "integer", name: "completed_version", nullable: true })
  completedVersion!: number | null;
}
