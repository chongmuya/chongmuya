import { Check, Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";
@Entity("email_verifications")
@Unique("email_verifications_id_key", ["id"])
@Check("email_verifications_purpose_check", "purpose = 'signup'")
@Check("email_verifications_failures_check", "failures >= 0 AND failures <= 5")
@Check(
  "email_verifications_delivery_check",
  "delivery IN ('sending', 'sent', 'failed')",
)
export class EmailVerification {
  @PrimaryColumn({
    name: "requester_hash",
    type: "varchar",
    length: 64,
    primaryKeyConstraintName: "email_verifications_pkey",
  })
  requesterHash!: string;
  @Column("uuid") id!: string;
  @Column({ type: "varchar", length: 254 }) email!: string;
  @Column({ type: "varchar", length: 20 }) purpose!: "signup";
  @Column({ name: "code_hash", type: "varchar", length: 64 }) codeHash!: string;
  @Column({ type: "varchar", length: 10 }) delivery!:
    "sending" | "sent" | "failed";
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Index("email_verifications_expiry")
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;
  @Column({ name: "retry_at", type: "timestamptz" }) retryAt!: Date;
  @Column("integer") failures!: number;
  @Column({ name: "verified_at", type: "timestamptz", nullable: true })
  verifiedAt!: Date | null;
  @Column({ name: "consumed_at", type: "timestamptz", nullable: true })
  consumedAt!: Date | null;
  @Column({ name: "cancelled_at", type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;
}
