import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("auth_attempts")
export class AuthAttempt {
  @PrimaryColumn("varchar", {
    length: 64,
    primaryKeyConstraintName: "auth_attempts_pkey",
  })
  key!: string;
  @Column("integer") count!: number;
  @Index("auth_attempts_expiry")
  @Column("timestamptz")
  resetsAt!: Date;
}
