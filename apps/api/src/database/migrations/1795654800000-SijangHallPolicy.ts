import type { MigrationInterface, QueryRunner } from "typeorm";

export class SijangHallPolicy1795654800000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "UPDATE restaurant_spaces SET min_guests=0 WHERE id=$1 AND restaurant_id=$2 AND kind='HALL' AND min_guests=60",
      [
        "b7cf1b8a-4d24-5601-96e6-7b03d625f685",
        "1212eb9d-efe2-5ab0-a443-ab567c109543",
      ],
    );
    await q.query(
      `UPDATE restaurants SET policies=jsonb_set(policies,'{sourceDescriptions,bookingPolicy}',to_jsonb($3::text)), version=version+1
      WHERE id=$1 AND policies#>>'{sourceDescriptions,bookingPolicy}'=$2`,
      [
        "1212eb9d-efe2-5ab0-a443-ab567c109543",
        "단체예약은 60명부터 최대 120명까지 가능해요. 평일을 선호하며 주말 예약은 매장과 협의가 필요해요.",
        "일반 홀은 소규모로도 예약할 수 있어요. 평일을 선호하며 주말 예약은 매장과 협의가 필요해요.",
      ],
    );
  }
  async down() {
    // This verified survey correction cannot be distinguished from a subsequent owner edit.
  }
}
