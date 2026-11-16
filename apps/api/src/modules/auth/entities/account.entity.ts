import { Check, Column, Entity, PrimaryColumn, Unique } from "typeorm";

@Entity("accounts")
@Check("accounts_account_type_check", "account_type IN ('organizer', 'owner')")
@Unique("accounts_email_key", ["email"])
export class Account {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "accounts_pkey" })
  id!: string;
  @Column({ name: "account_type", type: "varchar", length: 20, nullable: true })
  accountType!: "organizer" | "owner" | null;
  @Column({ type: "varchar", length: 254 }) email!: string;
  @Column("text") passwordHash!: string;
  @Column("timestamptz") createdAt!: Date;
  // Legacy accounts keep their IDs and remain explicitly unverified.
  @Column({ type: "varchar", length: 100, nullable: true }) name!:
    string | null;
  @Column({ type: "varchar", length: 100, nullable: true }) nickname!:
    string | null;
  @Column({ type: "varchar", length: 11, nullable: true }) phone!:
    string | null;
  @Column({ name: "phone_verified_at", type: "timestamptz", nullable: true })
  phoneVerifiedAt!: Date | null;
  @Column({ name: "email_verified_at", type: "timestamptz", nullable: true })
  emailVerifiedAt!: Date | null;
}
