import { Check, Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

@Entity("accounts")
@Index("accounts_withdrawal_receipt_hash", ["withdrawalReceiptHash"], {
  unique: true,
})
@Check("accounts_account_type_check", "account_type IN ('organizer', 'owner')")
@Unique("accounts_email_key", ["email"])
export class Account {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "accounts_pkey" })
  id!: string;
  @Column({ name: "account_type", type: "varchar", length: 20, nullable: true })
  accountType!: "organizer" | "owner" | null;
  @Column({ type: "varchar", length: 254 }) email!: string;
  @Column({ type: "text", nullable: true }) passwordHash!: string | null;
  @Column({
    name: "email_verification_source",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  emailVerificationSource!: "resend" | "kakao" | null;
  @Column({
    name: "credentials_changed_at",
    type: "timestamptz",
    nullable: true,
  })
  credentialsChangedAt!: Date | null;
  @Column({ name: "withdrawn_at", type: "timestamptz", nullable: true })
  withdrawnAt!: Date | null;
  @Column({
    name: "withdrawal_receipt_hash",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  withdrawalReceiptHash!: string | null;
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
