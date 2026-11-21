import type { MigrationInterface, QueryRunner } from "typeorm";

export class ConfirmReceivedReservations1795814000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Keep the selection and its confirmation snapshot in sync with live writes.
    await runner.query(
      "LOCK TABLE selected_reservations, reservation_progress IN EXCLUSIVE MODE",
    );
    await runner.query(`
      WITH candidates AS (
        SELECT s.id, p.state,
               (p.state #>> '{agreement,startsAt}')::timestamptz AS starts_at,
               (p.state #>> '{agreement,menuDeadlineAt}')::timestamptz AS menu_deadline,
               (p.state #>> '{order,submittedAt}')::timestamptz AS menu_submitted_at,
               (p.state #>> '{guidance,deadline}')::timestamptz AS payment_deadline,
               (p.state #>> '{receipt,receivedAt}')::timestamptz AS received_at,
               (p.state #>> '{receipt,recordedAt}')::timestamptz AS receipt_recorded_at,
               (p.state #>> '{transfer,reportedAt}')::timestamptz AS transfer_reported_at,
               (p.state #>> '{exceptionResolution,at}')::timestamptz AS resolved_at
        FROM selected_reservations s
        JOIN reservation_progress p ON p.reservation_id = s.id
        WHERE s.status IN ('PREPARING', 'CHECK_REQUIRED')
          AND s.cancelled_at IS NULL
          AND p.state->>'cancellation' IS NULL
          AND p.state->>'confirmation' IS NULL
          AND p.state #>> '{guidance,kind}' = 'REQUIRED'
          AND p.state #>> '{guidance,channel}' IN ('SMS', 'WEB')
          AND NULLIF(p.state #>> '{guidance,bank}', '') IS NOT NULL
          AND NULLIF(p.state #>> '{guidance,account}', '') IS NOT NULL
          AND NULLIF(p.state #>> '{guidance,holder}', '') IS NOT NULL
          AND p.state #>> '{receipt,guidanceRevision}' = p.state #>> '{guidance,revision}'
          AND p.state #>> '{receipt,audit,kind}' IS NOT NULL
          AND p.state->>'acknowledgedRevision' IS DISTINCT FROM p.state #>> '{guidance,revision}'
          AND (p.state #>> '{guidance,amount}')::integer > 0
          AND (p.state #>> '{receipt,amount}')::integer - (p.state->>'refunded')::integer
              = (p.state #>> '{guidance,amount}')::integer
      ), confirmed AS (
        UPDATE reservation_progress p
        SET state = jsonb_set(p.state, '{confirmation}', jsonb_build_object(
          'at', transaction_timestamp(),
          'audit', COALESCE(c.state #> '{exceptionResolution,audit}', c.state #> '{receipt,audit}'),
          'agreement', c.state->'agreement',
          'guidance', c.state->'guidance',
          'order', c.state->'order',
          'receivedAmount', c.state #> '{receipt,amount}'
        ))
        FROM candidates c
        WHERE p.reservation_id = c.id
          AND c.menu_submitted_at IS NOT NULL
          AND (
            c.menu_deadline IS NULL OR c.menu_submitted_at <= c.menu_deadline
            OR c.resolved_at >= c.menu_submitted_at
          )
          AND (
            c.menu_deadline IS NOT NULL OR c.starts_at > transaction_timestamp()
            OR c.resolved_at >= c.starts_at
          )
          AND c.payment_deadline IS NOT NULL
          AND (c.received_at <= c.payment_deadline OR c.resolved_at >= c.receipt_recorded_at)
          AND (
            c.state->>'transfer' IS NULL OR c.resolved_at >= c.transfer_reported_at
            OR (
              c.state #>> '{transfer,guidanceRevision}' = c.state #>> '{guidance,revision}'
              AND c.state #>> '{transfer,amount}' = c.state #>> '{guidance,amount}'
              AND c.transfer_reported_at <= c.payment_deadline
            )
          )
        RETURNING p.reservation_id
      )
      UPDATE selected_reservations s
      SET status = 'CONFIRMED', version = s.version + 1
      FROM confirmed c
      WHERE s.id = c.reservation_id;
    `);
  }

  async down(): Promise<void> {
    // A recorded reservation confirmation remains valid after a schema rollback.
  }
}
