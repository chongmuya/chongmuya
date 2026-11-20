import { Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";
@Entity("restaurant_operations")
export class RestaurantOperation {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("restaurants", "id", {
    name: "restaurant_operations_restaurant_id_fkey",
  })
  @Column({ type: "uuid", name: "restaurant_id" })
  restaurantId!: string;
  @Column({ type: "varchar", length: 40 }) action!: string;
  @Column({ type: "varchar", length: 100 }) actor!: string;
  @Column({ type: "varchar", length: 500 }) reason!: string;
  @Column({ type: "jsonb" }) details!: {
    accountId?: string;
    published?: boolean;
    contactId?: string;
    evidence?: string;
    prices?: { id: string; previousPrice: number | null; price: number }[];
  };
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
