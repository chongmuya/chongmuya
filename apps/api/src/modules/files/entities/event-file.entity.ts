import {
  Column,
  Entity,
  PrimaryColumn,
  ForeignKey,
  Index,
  Check,
  Unique,
} from "typeorm";
@Entity("event_files")
@Check("event_files_size_check", "size>0 AND size<=10485760")
@Check(
  "event_files_status_check",
  "status IN ('UPLOADING','READY','FAILED','DELETING','DELETE_FAILED','DELETED')",
)
@Unique("event_files_object_key_key", ["objectKey"])
@Index("event_files_event", ["eventId"])
export class EventFile {
  @PrimaryColumn("uuid") id!: string;
  @ForeignKey("events", "id", { name: "event_files_event_fkey" })
  @Column("uuid", { name: "event_id" })
  eventId!: string;
  @Column("uuid", { name: "expense_id", nullable: true }) expenseId!:
    string | null;
  @Column("varchar", { length: 200 }) name!: string;
  @Column("varchar", { length: 100 }) mime!: string;
  @Column("integer") size!: number;
  @Column("varchar", { length: 64 }) digest!: string;
  @Column("varchar", { length: 250, name: "object_key" }) objectKey!: string;
  @Column("varchar", { length: 24 }) status!:
    "UPLOADING" | "READY" | "FAILED" | "DELETING" | "DELETE_FAILED" | "DELETED";
  @Column("integer") version!: number;
  @Column("uuid", { name: "actor_id" }) actorId!: string;
  @Column("timestamptz", { name: "created_at" }) createdAt!: Date;
  @Column("timestamptz", { name: "updated_at" }) updatedAt!: Date;
}
