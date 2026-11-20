import type { MigrationInterface, QueryRunner } from "typeorm";
export class CalendarInbox1795761000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
ALTER TABLE events ADD COLUMN schedule_updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE notifications ADD COLUMN sequence bigserial UNIQUE, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN read_at timestamptz;
UPDATE notifications n SET created_at=f.occurred_at FROM notification_facts f WHERE n.event_key=f.event_key;
CREATE INDEX notifications_account_sequence ON notifications(account_id,sequence DESC);
CREATE TABLE phone_changes(session_id uuid PRIMARY KEY,account_id uuid NOT NULL,id uuid NOT NULL CONSTRAINT phone_changes_id_key UNIQUE,purpose varchar(20) NOT NULL CONSTRAINT phone_changes_purpose_check CHECK(purpose='phone_change'),phone varchar(11) NOT NULL,expires_at timestamptz NOT NULL,retry_at timestamptz NOT NULL,next_check_at timestamptz NOT NULL,checks integer NOT NULL,consumed_at timestamptz);
CREATE TABLE calendar_commands(schedule_id uuid,request_key uuid,digest varchar(64) NOT NULL,snapshot jsonb NOT NULL,PRIMARY KEY(schedule_id,request_key));
CREATE TABLE calendar_schedules(id uuid PRIMARY KEY,owner_id uuid NOT NULL,group_id uuid,creation_key uuid NOT NULL,creation_digest varchar(64) NOT NULL,title varchar(100) NOT NULL,date date NOT NULL,starts_at timestamptz,memo varchar(100) NOT NULL,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL,deleted_at timestamptz);
CREATE UNIQUE INDEX calendar_schedule_creation ON calendar_schedules(owner_id,creation_key);
CREATE INDEX calendar_schedule_range ON calendar_schedules(owner_id,date);
CREATE TABLE notification_preferences(account_id uuid PRIMARY KEY, reservation boolean NOT NULL DEFAULT true, settlement boolean NOT NULL DEFAULT true,event boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1);
`);
  }
  async down(): Promise<void> {
    throw new Error("Forward-only migration; restore from a verified backup.");
  }
}
