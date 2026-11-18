import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
@Entity("groups")
@Index("groups_owner_creation_key", ["ownerId", "creationKey"], {
  unique: true,
})
export class Group {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "groups_pkey" })
  id!: string;
  @Index("groups_owner")
  @ForeignKey("accounts", "id", { name: "groups_owner_id_fkey" })
  @Column({ type: "uuid", name: "owner_id" })
  ownerId!: string;
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
