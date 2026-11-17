import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from "typeorm";
import { Account } from "./account.entity.js";
@Entity("external_identities")
@Unique("external_identity_account_issuer", ["accountId", "issuer"])
export class ExternalIdentity {
  @PrimaryColumn("varchar", { length: 100 }) issuer!: string;
  @PrimaryColumn("varchar", { length: 255 }) sub!: string;
  @ForeignKey(() => Account, "id", { name: "external_identity_account_fkey" })
  @Column("uuid")
  accountId!: string;
  @Column("timestamptz") createdAt!: Date;
}
