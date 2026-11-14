import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import { Account } from "./account.entity.js";

@Entity("auth_sessions")
export class AuthSession {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "auth_sessions_pkey" })
  id!: string;
  @Index("auth_sessions_account")
  @ForeignKey(() => Account, "id", { name: "auth_sessions_accountId_fkey" })
  @Column("uuid")
  accountId!: string;
  @Column("timestamptz") expiresAt!: Date;
  @Column({ type: "timestamptz", nullable: true }) revokedAt!: Date | null;
}
