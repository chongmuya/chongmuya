import { Column, Entity, ForeignKey, PrimaryColumn } from "typeorm";
import type { SettlementState, Bank } from "../types/settlement.js";
@Entity("event_settlements")
export class EventSettlement {
  @ForeignKey("events", "id", { name: "event_settlements_event_fkey" })
  @PrimaryColumn("uuid", { name: "event_id" })
  eventId!: string;
  @Column("jsonb") state!: SettlementState;
}
@Entity("settlement_commands")
export class SettlementCommand {
  @ForeignKey("events", "id", { name: "settlement_commands_event_fkey" })
  @PrimaryColumn("uuid", { name: "event_id" })
  eventId!: string;
  @PrimaryColumn("uuid", { name: "request_key" }) requestKey!: string;
  @Column("varchar", { length: 64 }) digest!: string;
  @Column("uuid", { name: "actor_id" }) actorId!: string;
  @Column("varchar", { length: 24 }) action!: string;
  @Column("integer") version!: number;
  @Column("timestamptz", { name: "created_at" }) createdAt!: Date;
  @Column("jsonb") snapshot!: SettlementState;
}
@Entity("settlement_bank_defaults")
export class SettlementBankDefault {
  @PrimaryColumn("uuid", { name: "account_id" }) accountId!: string;
  @Column("jsonb") bank!: Bank;
}
