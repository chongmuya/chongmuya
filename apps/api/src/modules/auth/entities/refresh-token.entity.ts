import { Column, Entity, ForeignKey, Index, PrimaryColumn } from "typeorm";
import { AuthSession } from "./auth-session.entity.js";

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
