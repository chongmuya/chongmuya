import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
@Entity("groups")
@Index("groups_owner_creation_key", ["creatorId", "creationKey"], {
  unique: true,
})
export class Group {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "groups_pkey" })
  id!: string;
  @Index("groups_owner")
  @ForeignKey("accounts", "id", { name: "groups_owner_id_fkey" })
  @Column({ type: "uuid", name: "owner_id" })
  ownerId!: string;
  // Immutable creator; ownerId is the current manager, changed only by accepted handover.
  @ForeignKey("accounts", "id", { name: "groups_creator_id_fkey" })
  @Column({ type: "uuid", name: "creator_id" })
  creatorId!: string;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "varchar", length: 40, name: "group_type", nullable: true })
  groupType!: string | null;
  @Column({ type: "uuid", name: "creation_key", nullable: true })
  creationKey!: string | null;
  @Column({
    type: "varchar",
    length: 64,
    name: "creation_digest",
    nullable: true,
  })
  creationDigest!: string | null;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
