import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from "typeorm";

@Entity("accounts")
@Unique("accounts_email_key", ["email"])
export class Account {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "accounts_pkey" })
  id!: string;
  @Column({ type: "varchar", length: 254 }) email!: string;
  @Column("text") passwordHash!: string;
  @Column("timestamptz") createdAt!: Date;
}

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

@Entity("refresh_tokens")
export class RefreshToken {
  @PrimaryColumn("varchar", {
    length: 64,
    primaryKeyConstraintName: "refresh_tokens_pkey",
  })
  hash!: string;
  @Index("refresh_tokens_session")
  @ForeignKey(() => AuthSession, "id", {
    name: "refresh_tokens_sessionId_fkey",
    onDelete: "CASCADE",
  })
  @Column("uuid")
  sessionId!: string;
  @Column({ type: "timestamptz", nullable: true }) usedAt!: Date | null;
}

@Entity("auth_attempts")
export class AuthAttempt {
  @PrimaryColumn("varchar", {
    length: 64,
    primaryKeyConstraintName: "auth_attempts_pkey",
  })
  key!: string;
  @Column("integer") count!: number;
  @Column("timestamptz") resetsAt!: Date;
}
