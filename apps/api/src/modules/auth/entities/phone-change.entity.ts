import { Column, Entity, PrimaryColumn, Unique, Check } from "typeorm";
@Entity("phone_changes")
@Unique("phone_changes_id_key", ["id"])
@Check("phone_changes_purpose_check", "purpose = 'phone_change'")
export class PhoneChange {
  @PrimaryColumn("uuid", {
    name: "session_id",
    primaryKeyConstraintName: "phone_changes_pkey",
  })
  sessionId!: string;
  @Column({ type: "uuid", name: "account_id" }) accountId!: string;
  @Column("uuid") id!: string;
  @Column({ type: "varchar", length: 20 }) purpose!: "phone_change";
  @Column({ type: "varchar", length: 11 }) phone!: string;
  @Column({ type: "timestamptz", name: "expires_at" }) expiresAt!: Date;
  @Column({ type: "timestamptz", name: "retry_at" }) retryAt!: Date;
  @Column({ type: "timestamptz", name: "next_check_at" }) nextCheckAt!: Date;
  @Column({ type: "integer" }) checks!: number;
  @Column({ type: "timestamptz", name: "consumed_at", nullable: true })
  consumedAt!: Date | null;
}
