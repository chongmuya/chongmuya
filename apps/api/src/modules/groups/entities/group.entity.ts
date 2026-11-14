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
