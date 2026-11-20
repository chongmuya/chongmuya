import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Generated,
} from "typeorm";
@Entity("notification_facts")
export class NotificationFact {
  @PrimaryColumn("varchar", {
    length: 200,
    name: "event_key",
    primaryKeyConstraintName: "notification_facts_pkey",
  })
  eventKey!: string;
  @Column({ type: "varchar", length: 40 }) kind!: string;
  @Column({ type: "varchar", length: 24, default: "RESERVATION" })
  category!: string;
  @Column({ type: "uuid", name: "event_id" }) eventId!: string;
  @Column({ type: "uuid", name: "request_id" }) requestId!: string;
  @Column({ type: "uuid", name: "reservation_id", nullable: true })
  reservationId!: string | null;
  @Column({ type: "uuid", name: "target_id", nullable: true }) targetId!:
    string | null;
  @Column({ type: "integer" }) revision!: number;
  @Column({ type: "timestamptz", name: "occurred_at" }) occurredAt!: Date;
  @Column({ type: "jsonb", name: "merchant_hold", nullable: true })
  merchantHold!: { reason: string; replacementEventKey?: string } | null;
}
@Entity("notifications")
@Index("notifications_account_sequence", { synchronize: false })
@Index("notifications_fact_recipient", ["eventKey", "accountId"], {
  unique: true,
})
export class Notification {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "notifications_pkey" })
  id!: string;
  @ForeignKey("notification_facts", "event_key", {
    name: "notifications_fact_fkey",
  })
  @Column({ type: "varchar", length: 200, name: "event_key" })
  eventKey!: string;
  @ForeignKey("accounts", "id", { name: "notifications_account_fkey" })
  @Column({ type: "uuid", name: "account_id" })
  accountId!: string;
  @Column({ type: "bigint", unique: true })
  @Generated("increment")
  sequence!: string;
  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
  @Column({ type: "timestamptz", name: "read_at", nullable: true })
  readAt!: Date | null;
  @Column({ type: "varchar", length: 100 }) title!: string;
  @Column({ type: "varchar", length: 300 }) summary!: string;
  @Column({ type: "varchar", length: 200 }) destination!: string;
}
@Entity("notification_messages")
@Index("notification_messages_fact_recipient", ["eventKey", "recipientKey"], {
  unique: true,
})
export class NotificationMessage {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "notification_messages_pkey",
  })
  id!: string;
  @ForeignKey("notification_facts", "event_key", {
    name: "notification_messages_fact_fkey",
  })
  @Column({ type: "varchar", length: 200, name: "event_key" })
  eventKey!: string;
  @Column({ type: "varchar", length: 100, name: "recipient_key" })
  recipientKey!: string;
  @Column({ type: "varchar", length: 20, name: "phone_snapshot" })
  phoneSnapshot!: string;
  @Column({ type: "uuid", name: "contact_id_snapshot", nullable: true })
  contactIdSnapshot!: string | null;
  @Column({ type: "varchar", length: 1000 }) text!: string;
  @Column({ type: "boolean", name: "is_demo", default: false })
  isDemo!: boolean;
  @Column({ type: "varchar", length: 16, default: "PENDING" }) status!: string;
  @Column({ type: "varchar", length: 16, nullable: true }) provider!:
    "fake" | "solapi" | null;
  @Column({
    type: "varchar",
    length: 100,
    name: "provider_message_id",
    nullable: true,
  })
  providerMessageId!: string | null;
  @Column({
    type: "varchar",
    length: 100,
    name: "provider_group_id",
    nullable: true,
  })
  providerGroupId!: string | null;
  @Column({
    type: "varchar",
    length: 16,
    name: "failure_stage",
    nullable: true,
  })
  failureStage!: "SUBMISSION" | "DELIVERY" | null;
  @Column({ type: "varchar", length: 100, name: "error_code", nullable: true })
  errorCode!: string | null;
  @Column({ type: "integer", default: 0 }) attempts!: number;
  @Column({ type: "timestamptz", name: "started_at", nullable: true })
  startedAt!: Date | null;
  @Column({ type: "timestamptz", name: "updated_at" }) updatedAt!: Date;
  @Column({ type: "jsonb", default: [] }) operations!: {
    actor: string;
    reason: string;
    action: string;
    at: string;
  }[];
  @Column({ type: "jsonb", default: [] }) reports!: {
    key: string;
    at: string;
  }[];
}

@Entity("notification_preferences")
export class NotificationPreference {
  @PrimaryColumn("uuid", {
    name: "account_id",
    primaryKeyConstraintName: "notification_preferences_pkey",
  })
  accountId!: string;
  @Column({ type: "boolean", default: true }) reservation!: boolean;
  @Column({ type: "boolean", default: true }) settlement!: boolean;
  @Column({ type: "boolean", default: true }) event!: boolean;
  @Column({ type: "integer", default: 1 }) version!: number;
}
