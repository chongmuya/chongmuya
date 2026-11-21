import type { MigrationInterface, QueryRunner } from "typeorm";

export class AttendanceRoundRosters1795813000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE attendance_round_exclusions (
        round_id uuid NOT NULL, participant_id uuid NOT NULL, event_id uuid NOT NULL,
        CONSTRAINT attendance_round_exclusions_pkey PRIMARY KEY (round_id, participant_id),
        CONSTRAINT attendance_round_exclusions_round_fkey
          FOREIGN KEY (round_id, event_id) REFERENCES attendance_rounds(id, event_id) ON DELETE CASCADE,
        CONSTRAINT attendance_round_exclusions_participant_fkey
          FOREIGN KEY (participant_id, event_id) REFERENCES event_participants(id, event_id) ON DELETE CASCADE
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE attendance_round_exclusions IN ACCESS EXCLUSIVE MODE",
    );
    const [row] = (await runner.query(
      "SELECT EXISTS(SELECT 1 FROM attendance_round_exclusions) AS occupied",
    )) as { occupied: boolean }[];
    if (row?.occupied)
      throw new Error(
        "AttendanceRoundRosters rollback requires preserving round membership.",
      );
    await runner.query("DROP TABLE attendance_round_exclusions");
  }
}
