import { Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";

@Entity("account_consents")
export class AccountConsent {
  @ForeignKey("accounts", "id", { name: "account_consents_account_id_fkey" })
  @PrimaryColumn({
    name: "account_id",
    type: "uuid",
    primaryKeyConstraintName: "account_consents_pkey",
  })
  accountId!: string;
  @PrimaryColumn({
    name: "term_id",
    type: "varchar",
    length: 40,
    primaryKeyConstraintName: "account_consents_pkey",
  })
  termId!: string;
  @Column({ type: "varchar", length: 64 }) version!: string;
  @Column("boolean") accepted!: boolean;
  @Column({ name: "recorded_at", type: "timestamptz" }) recordedAt!: Date;
}
