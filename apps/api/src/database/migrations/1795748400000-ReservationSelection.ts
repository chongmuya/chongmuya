import type { MigrationInterface, QueryRunner } from "typeorm";
export class ReservationSelection1795748400000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
   DROP INDEX reservation_requests_event_unique;
   ALTER TABLE reservation_requests ADD COLUMN round integer NOT NULL DEFAULT 1, ADD COLUMN version integer NOT NULL DEFAULT 1, ADD COLUMN state varchar(16) NOT NULL DEFAULT 'ACTIVE', ADD COLUMN created_by_id uuid, ADD COLUMN current_contact_account_id uuid, ADD COLUMN current_contact_name varchar(80), ADD COLUMN current_contact_phone varchar(20);
   UPDATE reservation_requests r SET state=CASE WHEN r.closed_at IS NULL THEN 'ACTIVE' ELSE 'CLOSED' END, current_contact_account_id=e.owner_id, current_contact_name=r.contact_name, current_contact_phone=r.contact_phone FROM events e WHERE e.id=r.event_id;
   CREATE UNIQUE INDEX reservation_requests_event_round ON reservation_requests(event_id,round);
   CREATE UNIQUE INDEX reservation_requests_event_key ON reservation_requests(event_id,request_key);
   CREATE UNIQUE INDEX reservation_requests_active ON reservation_requests(event_id) WHERE state='ACTIVE';
   ALTER TABLE reservation_request_targets ADD COLUMN photo_path varchar(500), ADD COLUMN candidate_state varchar(24) NOT NULL DEFAULT 'OPEN', ADD COLUMN closed_at timestamptz, ADD COLUMN closed_by varchar(100), ADD COLUMN closure_reason varchar(500);
   CREATE TABLE selected_reservations (
    id uuid CONSTRAINT selected_reservations_pkey PRIMARY KEY,
    event_id uuid NOT NULL CONSTRAINT selected_reservations_event_fkey REFERENCES events(id),
    request_id uuid NOT NULL CONSTRAINT selected_reservations_request_fkey REFERENCES reservation_requests(id),
    target_id uuid NOT NULL CONSTRAINT selected_reservations_target_fkey REFERENCES reservation_request_targets(id),
    revision integer NOT NULL, version integer NOT NULL DEFAULT 1, status varchar(24) NOT NULL DEFAULT 'PREPARING', snapshot jsonb NOT NULL,
    selected_by uuid NOT NULL, selected_at timestamptz NOT NULL, cancelled_at timestamptz
   );
   CREATE UNIQUE INDEX selected_reservations_event_active ON selected_reservations(event_id) WHERE cancelled_at IS NULL;
   CREATE UNIQUE INDEX selected_reservations_request ON selected_reservations(request_id);
   CREATE TABLE reservation_decisions (
    request_id uuid NOT NULL CONSTRAINT reservation_decisions_request_fkey REFERENCES reservation_requests(id),request_key uuid NOT NULL,
    digest varchar(64) NOT NULL,target_id uuid NOT NULL,action varchar(16) NOT NULL,actor_id uuid NOT NULL,revision integer NOT NULL,created_at timestamptz NOT NULL,
    CONSTRAINT reservation_decisions_pkey PRIMARY KEY(request_id,request_key)
   );
   CREATE TABLE notification_facts (
    event_key varchar(200) CONSTRAINT notification_facts_pkey PRIMARY KEY,kind varchar(40) NOT NULL,category varchar(24) NOT NULL DEFAULT 'RESERVATION',event_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid,target_id uuid,revision integer NOT NULL,occurred_at timestamptz NOT NULL
   );
   CREATE TABLE notifications (
    id uuid CONSTRAINT notifications_pkey PRIMARY KEY,event_key varchar(200) NOT NULL CONSTRAINT notifications_fact_fkey REFERENCES notification_facts(event_key),account_id uuid NOT NULL CONSTRAINT notifications_account_fkey REFERENCES accounts(id),title varchar(100) NOT NULL,summary varchar(300) NOT NULL,destination varchar(200) NOT NULL
   );
   CREATE UNIQUE INDEX notifications_fact_recipient ON notifications(event_key,account_id);
   CREATE TABLE notification_messages (
    id uuid CONSTRAINT notification_messages_pkey PRIMARY KEY,event_key varchar(200) NOT NULL CONSTRAINT notification_messages_fact_fkey REFERENCES notification_facts(event_key),recipient_key varchar(100) NOT NULL,phone_snapshot varchar(20) NOT NULL,text varchar(1000) NOT NULL,is_demo boolean NOT NULL DEFAULT false,status varchar(16) NOT NULL DEFAULT 'PENDING',provider varchar(16),provider_message_id varchar(100),provider_group_id varchar(100),failure_stage varchar(16),error_code varchar(100),attempts integer NOT NULL DEFAULT 0,started_at timestamptz,updated_at timestamptz NOT NULL,operations jsonb NOT NULL DEFAULT '[]'::jsonb,reports jsonb NOT NULL DEFAULT '[]'::jsonb
   );
   CREATE UNIQUE INDEX notification_messages_fact_recipient ON notification_messages(event_key,recipient_key);
  `);
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(
      "LOCK TABLE reservation_requests, reservation_request_targets, selected_reservations, reservation_decisions, notification_facts, notification_messages, notifications IN ACCESS EXCLUSIVE MODE",
    );
    const [row] = (await r.query(
      `SELECT EXISTS(SELECT 1 FROM reservation_requests WHERE round>1) OR EXISTS(SELECT 1 FROM selected_reservations) OR EXISTS(SELECT 1 FROM reservation_decisions) OR EXISTS(SELECT 1 FROM notification_facts) OR EXISTS(SELECT 1 FROM reservation_request_targets WHERE candidate_state<>'OPEN') AS occupied`,
    )) as { occupied: boolean }[];
    if (row?.occupied)
      throw new Error(
        "Reservation rounds, decisions and notification evidence require a forward recovery migration.",
      );
    await r.query(`DROP TABLE notification_messages, notifications, notification_facts, reservation_decisions, selected_reservations;
   ALTER TABLE reservation_request_targets DROP COLUMN photo_path, DROP COLUMN candidate_state, DROP COLUMN closed_at, DROP COLUMN closed_by, DROP COLUMN closure_reason;
   DROP INDEX reservation_requests_event_round; DROP INDEX reservation_requests_event_key; DROP INDEX reservation_requests_active;
   ALTER TABLE reservation_requests DROP COLUMN round,DROP COLUMN version,DROP COLUMN state,DROP COLUMN created_by_id,DROP COLUMN current_contact_account_id,DROP COLUMN current_contact_name,DROP COLUMN current_contact_phone;
   CREATE UNIQUE INDEX reservation_requests_event_unique ON reservation_requests(event_id);
  `);
  }
}
