import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from "typeorm";

@Entity("account_kakao_withdrawals")
@Unique("account_kakao_withdrawals_receipt_key", ["receiptHash"])
export class KakaoWithdrawal {
  @ForeignKey("accounts", "id", {
    name: "account_kakao_withdrawals_account_fkey",
  })
  @PrimaryColumn("uuid", {
    name: "account_id",
    primaryKeyConstraintName: "account_kakao_withdrawals_pkey",
  })
  accountId!: string;

  @Column({ name: "receipt_hash", type: "varchar", length: 64 })
  receiptHash!: string;

  @Column({ name: "opened_at", type: "timestamptz" })
  openedAt!: Date;

  @Column({ name: "unlink_started", type: "boolean", default: false })
  unlinkStarted!: boolean;

  @Column({ name: "lease_id", type: "uuid", nullable: true })
  leaseId!: string | null;

  @Column({ name: "lease_until", type: "timestamptz", nullable: true })
  leaseUntil!: Date | null;
}

// A same-app verification contains no account or Kakao user ID.
@Entity("account_kakao_withdrawal_apps")
export class KakaoWithdrawalApp {
  @PrimaryColumn("varchar", {
    length: 64,
    primaryKeyConstraintName: "account_kakao_withdrawal_apps_pkey",
  })
  binding!: string;
}
