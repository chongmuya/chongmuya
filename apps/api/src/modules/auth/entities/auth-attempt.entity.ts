import { Column, Entity, PrimaryColumn } from "typeorm";

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
