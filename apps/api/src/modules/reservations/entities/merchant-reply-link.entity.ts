import { Check, Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";
@Entity("merchant_reply_links")
@Check("merchant_reply_links_generation_check", "generation > 0")
export class MerchantReplyLink {
  @ForeignKey("reservation_request_targets", "id", {
    name: "merchant_reply_links_target_id_fkey",
  })
  @PrimaryColumn("uuid", { name: "target_id" })
  targetId!: string;
  @Column({ type: "uuid", name: "contact_id" }) contactId!: string;
  @Column({ type: "varchar", length: 20, name: "phone_snapshot" })
  phoneSnapshot!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "text", name: "encrypted_token", nullable: true })
  encryptedToken!: string | null;
  @Column({ type: "integer", default: 1 }) generation!: number;
  @Column({ type: "timestamptz", name: "expires_at" }) expiresAt!: Date;
  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt!: Date | null;
}
