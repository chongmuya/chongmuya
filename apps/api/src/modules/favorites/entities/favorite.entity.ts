import { Column, Entity, PrimaryColumn, ForeignKey, Index } from "typeorm";
@Entity("favorites")
@Index("favorites_personal", ["accountId", "restaurantId"], {
  unique: true,
  where: "group_id IS NULL",
})
@Index("favorites_group", ["groupId", "restaurantId"], {
  unique: true,
  where: "group_id IS NOT NULL",
})
export class Favorite {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("accounts", "id", { name: "favorites_account_id_fkey" })
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;
  @ForeignKey("groups", "id", { name: "favorites_group_id_fkey" })
  @Column({ type: "uuid", name: "group_id", nullable: true })
  groupId!: string | null;
  @Column({ type: "uuid", name: "restaurant_id" }) restaurantId!: string;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
