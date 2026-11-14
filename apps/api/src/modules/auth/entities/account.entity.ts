import { Column, Entity, PrimaryColumn, Unique } from "typeorm";

@Entity("accounts")
@Unique("accounts_email_key", ["email"])
export class Account {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "accounts_pkey" })
  id!: string;
  @Column({ type: "varchar", length: 254 }) email!: string;
  @Column("text") passwordHash!: string;
  @Column("timestamptz") createdAt!: Date;
}
