import type { MigrationInterface, QueryRunner } from "typeorm";
export class SettlementRecords1795759200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
 CREATE TABLE event_settlements(event_id uuid PRIMARY KEY CONSTRAINT event_settlements_event_fkey REFERENCES events(id),state jsonb NOT NULL);
 CREATE TABLE settlement_commands(event_id uuid CONSTRAINT settlement_commands_event_fkey REFERENCES events(id),request_key uuid,digest varchar(64) NOT NULL,actor_id uuid NOT NULL,action varchar(24) NOT NULL,version integer NOT NULL,created_at timestamptz NOT NULL,snapshot jsonb NOT NULL,PRIMARY KEY(event_id,request_key));
 CREATE TABLE settlement_bank_defaults(account_id uuid PRIMARY KEY,bank jsonb NOT NULL);
 CREATE TABLE event_files(id uuid PRIMARY KEY,event_id uuid NOT NULL CONSTRAINT event_files_event_fkey REFERENCES events(id),expense_id uuid,name varchar(200) NOT NULL,mime varchar(100) NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=10485760),digest varchar(64) NOT NULL,object_key varchar(250) NOT NULL UNIQUE,status varchar(24) NOT NULL CHECK(status IN ('UPLOADING','READY','FAILED','DELETING','DELETE_FAILED','DELETED')),version integer NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
 CREATE INDEX event_files_event ON event_files(event_id);
 `);
  }
  async down(): Promise<void> {
    throw new Error("Forward-only migration; restore from a verified backup.");
  }
}
