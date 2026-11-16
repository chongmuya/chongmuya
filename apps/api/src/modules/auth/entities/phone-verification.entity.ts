import { Check, Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

// One current challenge per browser requester. Reissue rotates the request ID.
@Entity("phone_verifications")
@Unique("phone_verifications_id_key", ["id"])
@Check("phone_verifications_purpose_check", "purpose = 'signup'")
@Check("phone_verifications_check_count_check", "check_count >= 0")
export class PhoneVerification {
  @PrimaryColumn({
    name: "requester_hash",
    type: "varchar",
    length: 64,
    primaryKeyConstraintName: "phone_verifications_pkey",
  })
  requesterHash!: string;
  @Column("uuid") id!: string;
  @Column({ type: "varchar", length: 11 }) phone!: string;
  @Column({ type: "varchar", length: 20 }) purpose!: "signup";
  @Column({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Index("phone_verifications_expiry")
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;
  @Column({ name: "retry_at", type: "timestamptz" }) retryAt!: Date;
  @Column({ name: "next_check_at", type: "timestamptz" }) nextCheckAt!: Date;
  @Column({ name: "check_count", type: "integer" }) checkCount!: number;
  @Column({ name: "verified_at", type: "timestamptz", nullable: true })
  verifiedAt!: Date | null;
  @Column({ name: "consumed_at", type: "timestamptz", nullable: true })
  consumedAt!: Date | null;
  @Column({ name: "cancelled_at", type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;
}
