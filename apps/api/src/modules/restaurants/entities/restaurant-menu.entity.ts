import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";

@Entity("restaurant_menus")
@Check("restaurant_menus_price_check", "price IS NULL OR price >= 0")
@Check("restaurant_menus_kind_check", "kind IN ('REGULAR','SET')")
export class RestaurantMenu {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "restaurant_menus_pkey" })
  id!: string;
  @Index("restaurant_menus_restaurant")
  @ForeignKey("restaurants", "id", {
    name: "restaurant_menus_restaurant_id_fkey",
  })
  @Column({ type: "uuid", name: "restaurant_id" })
  restaurantId!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ type: "varchar", length: 8 }) kind!: "REGULAR" | "SET";
  @Column({ type: "integer", nullable: true }) price!: number | null;
  @Column({ type: "varchar", length: 30 }) unit!: string;
  @Column({ type: "integer", default: 0 }) position!: number;
  @Column({ type: "boolean", default: true }) available!: boolean;
}
