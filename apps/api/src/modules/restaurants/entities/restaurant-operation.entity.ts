import { Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";
@Entity("restaurant_operations")
export class RestaurantOperation {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("restaurants", "id")
  @Column({ type: "uuid", name: "restaurant_id" })
  restaurantId!: string;
  @Column({ type: "varchar", length: 40 }) action!: string;
  @Column({ type: "varchar", length: 100 }) actor!: string;
  @Column({ type: "varchar", length: 500 }) reason!: string;
  @Column({ type: "jsonb" }) details!: {
    accountId?: string;
    published?: boolean;
    contactId?: string;
  };
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
