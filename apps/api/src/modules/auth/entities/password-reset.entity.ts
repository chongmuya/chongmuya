import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import { Account } from "./account.entity.js";
@Entity("password_resets")
export class PasswordReset {
  @PrimaryColumn("varchar", { length: 64 }) hash!: string;
  @Index("password_resets_account")
  @ForeignKey(() => Account, "id", { name: "password_resets_account_fkey" })
  @Column("uuid")
  accountId!: string;
  @Column("timestamptz") createdAt!: Date;
  @Index("password_resets_expiry")
  @Column("timestamptz")
  expiresAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) usedAt!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) invalidatedAt!: Date | null;
  @Column({ type: "varchar", length: 10 }) delivery!:
    "sending" | "sent" | "failed";
}
