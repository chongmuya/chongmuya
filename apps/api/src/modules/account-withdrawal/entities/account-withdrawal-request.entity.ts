import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";

@Entity("account_withdrawal_requests")
@Index("account_withdrawal_pending", ["accountId"], {
  unique: true,
  where: "resolved_at IS NULL",
})
export class AccountWithdrawalRequest {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("accounts", "id", { name: "account_withdrawal_account_fkey" })
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;
  @Column({ type: "text", array: true }) blockers!: string[];
  @Column({ type: "timestamptz", name: "opened_at" }) openedAt!: Date;
  @Column({ type: "timestamptz", name: "resolved_at", nullable: true })
  resolvedAt!: Date | null;
  @Column({ type: "varchar", length: 12, nullable: true })
  resolution!: "REVIEWED" | "WITHDRAWN" | null;
  @Column({ type: "varchar", length: 80, name: "reviewed_by", nullable: true })
  reviewedBy!: string | null;
}

@Entity("account_withdrawal_request_keys")
export class AccountWithdrawalRequestKey {
  @PrimaryColumn({ type: "uuid", name: "account_id" }) accountId!: string;
  @PrimaryColumn({ type: "uuid", name: "request_key" }) requestKey!: string;
  @ForeignKey("account_withdrawal_requests", "id", {
    name: "account_withdrawal_request_keys_request_fkey",
  })
  @Column({ type: "uuid", name: "request_id" })
  requestId!: string;
}
