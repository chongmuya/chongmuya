import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { Account } from "./account.entity.js";
import { AuthSession } from "./auth-session.entity.js";
@Entity("kakao_attempts")
@Unique("kakao_attempts_id_key", ["id"])
export class KakaoAttempt {
  @PrimaryColumn("varchar", { length: 64 }) browserHash!: string;
  @Column("uuid") id!: string;
  @Column("varchar", { length: 64 }) stateHash!: string;
  @Column("text") verifier!: string;
  @Column("text") nonce!: string;
  @Column("varchar", { length: 10 }) purpose!: "login" | "link";
  @Column("varchar", { length: 12 }) status!:
    | "requested"
    | "exchanging"
    | "verified"
    | "failed"
    | "consumed"
    | "cancelled";
  @ForeignKey(() => Account, "id", { name: "kakao_attempts_account_fkey" })
  @Column({ type: "uuid", nullable: true })
  accountId!: string | null;
  @ForeignKey(() => AuthSession, "id", {
    name: "kakao_attempts_session_fkey",
    onDelete: "CASCADE",
  })
  @Column({ type: "uuid", nullable: true })
  sessionId!: string | null;
  @Column({ type: "timestamptz", nullable: true })
  reauthenticatedAt!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) consentAt!: Date | null;
  @Column({ type: "varchar", length: 100, nullable: true }) issuer!:
    string | null;
  @Column({ type: "varchar", length: 255, nullable: true }) sub!: string | null;
  @Column({ type: "varchar", length: 254, nullable: true }) email!:
    string | null;
  @Column({ type: "timestamptz", nullable: true })
  emailVerifiedAt!: Date | null;
  @Column({ type: "varchar", length: 40, nullable: true }) errorCode!:
    string | null;
  @Column("text") next!: string;
  @Column("timestamptz") createdAt!: Date;
  @Index("kakao_attempts_expiry")
  @Column("timestamptz")
  expiresAt!: Date;
}
