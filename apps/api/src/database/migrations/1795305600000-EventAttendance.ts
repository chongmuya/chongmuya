import type { MigrationInterface, QueryRunner } from "typeorm";

export class EventAttendance1795305600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE event_participants (
        id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id),
        group_member_id uuid REFERENCES group_members(id), name varchar(100) NOT NULL,
        phone_last4 varchar(4), label varchar(40), version integer NOT NULL DEFAULT 1,
        identity_version integer NOT NULL DEFAULT 1, position integer NOT NULL, created_at timestamptz NOT NULL,
        UNIQUE(id,event_id), UNIQUE(event_id,group_member_id),
        CHECK (phone_last4 IS NULL OR phone_last4 ~ '^[0-9]{4}$')
      );
      CREATE INDEX event_participants_event ON event_participants(event_id);
      CREATE TABLE event_roster_additions (
        event_id uuid NOT NULL REFERENCES events(id), request_key uuid NOT NULL,
        digest varchar(64) NOT NULL, added_count integer NOT NULL, created_at timestamptz NOT NULL,
        PRIMARY KEY(event_id,request_key)
      );
      CREATE TABLE attendance_rounds (
        id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id),
        title varchar(100) NOT NULL, position integer NOT NULL, share_id uuid NOT NULL UNIQUE,
        request_key uuid NOT NULL, closed_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL,
        UNIQUE(id,event_id), UNIQUE(event_id,position), UNIQUE(event_id,request_key)
      );
      CREATE TABLE attendance_responses (
        round_id uuid NOT NULL, participant_id uuid NOT NULL, event_id uuid NOT NULL,
        self_answer varchar(16), manager_override varchar(16), version integer NOT NULL DEFAULT 1,
        self_responded_at timestamptz, overridden_at timestamptz,
        PRIMARY KEY(round_id,participant_id),
        FOREIGN KEY(round_id,event_id) REFERENCES attendance_rounds(id,event_id),
        FOREIGN KEY(participant_id,event_id) REFERENCES event_participants(id,event_id),
        CHECK (self_answer IS NULL OR self_answer IN ('ATTENDING','ABSENT')),
        CHECK (manager_override IS NULL OR manager_override IN ('UNANSWERED','ATTENDING','ABSENT'))
      );
      CREATE TABLE attendance_reviews (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, round_id uuid NOT NULL,
        name varchar(100) NOT NULL, phone_last4 varchar(4) NOT NULL,
        answer varchar(16) NOT NULL, reason varchar(24) NOT NULL, status varchar(16) NOT NULL DEFAULT 'PENDING',
        version integer NOT NULL DEFAULT 1, submitted_at timestamptz NOT NULL,
        participant_id uuid, processed_at timestamptz, resolution varchar(16),
        FOREIGN KEY(round_id,event_id) REFERENCES attendance_rounds(id,event_id),
        FOREIGN KEY(participant_id,event_id) REFERENCES event_participants(id,event_id),
        CHECK (phone_last4 ~ '^[0-9]{4}$'),
        CHECK (answer IN ('ATTENDING','ABSENT')),
        CHECK (status IN ('PENDING','LINKED','EXCLUDED')),
        CHECK (reason IN ('DUPLICATE_IDENTITY','AMBIGUOUS_NAME','NOT_LISTED')),
        CHECK (resolution IS NULL OR resolution IN ('KEEP','APPLY','EXCLUDE'))
      );
      CREATE UNIQUE INDEX attendance_reviews_pending ON attendance_reviews(round_id,name,phone_last4) WHERE status='PENDING';
      CREATE INDEX attendance_reviews_round ON attendance_reviews(round_id,submitted_at);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE event_participants, event_roster_additions, attendance_rounds, attendance_responses, attendance_reviews IN ACCESS EXCLUSIVE MODE",
    );
    const [row] = (await runner.query(
      "SELECT EXISTS(SELECT 1 FROM event_participants) OR EXISTS(SELECT 1 FROM attendance_rounds) OR EXISTS(SELECT 1 FROM event_roster_additions) AS occupied",
    )) as { occupied: boolean }[];
    if (row?.occupied)
      throw new Error(
        "EventAttendance rollback requires a forward migration preserving attendance records.",
      );
    await runner.query(
      "DROP TABLE attendance_reviews, attendance_responses, attendance_rounds, event_roster_additions, event_participants",
    );
  }
}
