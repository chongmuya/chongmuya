import type { MigrationInterface, QueryRunner } from "typeorm";
export class ReservationCompletion1795755600000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
 CREATE TABLE reservation_progress(reservation_id uuid CONSTRAINT reservation_progress_pkey PRIMARY KEY CONSTRAINT reservation_progress_selection_fkey REFERENCES selected_reservations(id),state jsonb NOT NULL);
 CREATE TABLE reservation_completion_history(id uuid CONSTRAINT reservation_completion_history_pkey PRIMARY KEY,reservation_id uuid NOT NULL CONSTRAINT reservation_completion_history_selection_fkey REFERENCES selected_reservations(id),request_key uuid NOT NULL,digest varchar(64) NOT NULL,action varchar(40) NOT NULL,version integer NOT NULL,audit jsonb NOT NULL,snapshot jsonb NOT NULL,evidence jsonb NOT NULL);
 CREATE UNIQUE INDEX reservation_completion_history_command ON reservation_completion_history(reservation_id,request_key);
 CREATE TABLE reservation_changes(id uuid CONSTRAINT reservation_changes_pkey PRIMARY KEY,reservation_id uuid NOT NULL CONSTRAINT reservation_changes_selection_fkey REFERENCES selected_reservations(id),kind varchar(10) NOT NULL,subject varchar(16) NOT NULL,reason varchar(100) NOT NULL,status varchar(16) NOT NULL,proposal jsonb,created_at timestamptz NOT NULL,resolved_at timestamptz);
 CREATE UNIQUE INDEX reservation_changes_pending ON reservation_changes(reservation_id) WHERE status IN ('REQUESTED','PROPOSED');
 CREATE TABLE reservation_management_links(reservation_id uuid CONSTRAINT reservation_management_links_pkey PRIMARY KEY CONSTRAINT reservation_management_links_selection_fkey REFERENCES selected_reservations(id),contact_id uuid NOT NULL,phone_snapshot varchar(20) NOT NULL,digest varchar(64) NOT NULL,encrypted_token text NOT NULL,generation integer NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,audit jsonb NOT NULL);
 `);
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(
      "LOCK TABLE reservation_progress,reservation_completion_history,reservation_changes,reservation_management_links IN ACCESS EXCLUSIVE MODE",
    );
    const [row] = await r.query(
      "SELECT EXISTS(SELECT 1 FROM reservation_progress) OR EXISTS(SELECT 1 FROM reservation_completion_history) OR EXISTS(SELECT 1 FROM reservation_changes) OR EXISTS(SELECT 1 FROM reservation_management_links) AS occupied",
    );
    if (row.occupied)
      throw new Error(
        "Reservation completion evidence requires forward recovery.",
      );
    await r.query(
      "DROP TABLE reservation_management_links,reservation_changes,reservation_completion_history,reservation_progress",
    );
  }
}
