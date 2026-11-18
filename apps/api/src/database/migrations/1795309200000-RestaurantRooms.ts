import type { MigrationInterface, QueryRunner } from "typeorm";

export class RestaurantRooms1795309200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE restaurant_spaces
        DROP CONSTRAINT restaurant_spaces_kind_check,
        ADD CONSTRAINT restaurant_spaces_kind_check
          CHECK (kind IN ('HALL','ROOM','FLOOR','WHOLE'));
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "LOCK TABLE restaurant_spaces, reservation_requests IN ACCESS EXCLUSIVE MODE",
    );
    const [result] = (await runner.query(
      "SELECT EXISTS(SELECT 1 FROM restaurant_spaces WHERE kind = 'ROOM') OR EXISTS(SELECT 1 FROM reservation_requests WHERE snapshot->>'space' = 'ROOM') AS occupied",
    )) as { occupied: boolean }[];
    if (result?.occupied)
      throw new Error(
        "RestaurantRooms rollback requires a forward migration preserving room and inquiry records.",
      );
    await runner.query(`
      ALTER TABLE restaurant_spaces
        DROP CONSTRAINT restaurant_spaces_kind_check,
        ADD CONSTRAINT restaurant_spaces_kind_check
          CHECK (kind IN ('HALL','FLOOR','WHOLE'));
    `);
  }
}
