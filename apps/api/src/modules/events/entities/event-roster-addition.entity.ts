import { Column, Entity, PrimaryColumn, ForeignKey } from "typeorm";
@Entity("event_roster_additions")
export class EventRosterAddition {
  @ForeignKey("events", "id", { name: "event_roster_additions_event_id_fkey" })
  @PrimaryColumn({
    type: "uuid",
    name: "event_id",
    primaryKeyConstraintName: "event_roster_additions_pkey",
  })
  eventId!: string;
  @PrimaryColumn({
    type: "uuid",
    name: "request_key",
    primaryKeyConstraintName: "event_roster_additions_pkey",
  })
  requestKey!: string;
  @Column({ type: "varchar", length: 64 }) digest!: string;
  @Column({ type: "integer", name: "added_count" }) addedCount!: number;
  @Column({ type: "timestamptz", name: "created_at" }) createdAt!: Date;
}
