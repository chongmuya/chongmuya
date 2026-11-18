import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";

// A roster entry is private group data, never an account or a permission grant.
@Entity("group_members")
@Check(
  "group_members_phone_last4_check",
  '"phone_last4" IS NULL OR "phone_last4" ~ \'^[0-9]{4}$\'',
)
export class GroupMember {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "group_members_pkey" })
  id!: string;
  @Index("group_members_group")
  @ForeignKey("groups", "id", { name: "group_members_group_id_fkey" })
  @Column({ type: "uuid", name: "group_id" })
  groupId!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "varchar", length: 4, name: "phone_last4", nullable: true })
  phoneLast4!: string | null;
  @Column({ type: "varchar", length: 40, nullable: true }) label!:
    string | null;
  @Column({ type: "integer" }) position!: number;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
