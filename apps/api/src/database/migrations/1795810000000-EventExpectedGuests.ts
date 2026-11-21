import type { MigrationInterface, QueryRunner } from "typeorm";

export class EventExpectedGuests1795810000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE events ADD COLUMN expected_guests integer
        CONSTRAINT events_expected_guests_check CHECK (expected_guests BETWEEN 1 AND 100000);

      WITH first_inquiry AS (
        SELECT DISTINCT ON (event_id) event_id, snapshot->>'expectedGuests' AS guests
        FROM reservation_requests
        ORDER BY event_id, round
      )
      UPDATE events e
      SET expected_guests = first_inquiry.guests::integer
      FROM first_inquiry
      WHERE e.id = first_inquiry.event_id
        AND first_inquiry.guests ~ '^([1-9][0-9]{0,4}|100000)$';

      INSERT INTO attendance_rounds (id, event_id, title, position, share_id, request_key, created_at)
      SELECT gen_random_uuid(), e.id, '1차', 1, gen_random_uuid(), gen_random_uuid(), now()
      FROM events e
      WHERE e.expected_guests IS NOT NULL
      ON CONFLICT (event_id, position) DO NOTHING;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      LOCK TABLE events IN ACCESS EXCLUSIVE MODE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM events WHERE expected_guests IS NOT NULL) THEN
          RAISE EXCEPTION 'Event estimates must be preserved in a forward migration.';
        END IF;
      END $$;
      ALTER TABLE events DROP COLUMN expected_guests;
    `);
  }
}
