import type { MigrationInterface, QueryRunner } from "typeorm";

export class DemoRestaurantLabels1795658400000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const names = [
      ["가상 온기홀", "온기홀"],
      ["가상 한층식탁", "한층식탁"],
      ["가상 확인중식당", "소담식당"],
      ["가상 사진없는집", "마루식탁"],
    ];
    for (const [i, [oldName, name]] of names.entries()) {
      const suffix = String(i + 1).padStart(12, "0");
      const id = `c0210000-0000-4000-8000-${suffix}`;
      const address = `서울 광진구 늘봄길 ${i + 1}`;
      await q.query(
        `UPDATE restaurants r SET name=$3, address=$5, version=version+1
         WHERE id=$1 AND is_demo AND name=$2 AND address=$4
           AND base_address IS NULL AND registration_key IS NULL AND NOT identity_conflict
           AND NOT EXISTS (SELECT 1 FROM restaurants other WHERE other.id<>r.id
              AND other.normalized_name=restaurant_identity_text($3::text)
              AND other.normalized_address=restaurant_identity_text($5::text))`,
        [
          id,
          oldName,
          name,
          `서울 광진구 가상 테스트길 ${i + 1} (실제 매장 아님)`,
          address,
        ],
      );
      await q.query(
        `UPDATE restaurant_menus SET name='오늘의 정식' WHERE id=$1 AND restaurant_id=$2
         AND name='테스트용 식사' AND EXISTS(SELECT 1 FROM restaurants WHERE id=$2 AND is_demo)`,
        [`c0230000-0000-4000-8000-${suffix}`, id],
      );
    }
  }
  async down() {
    // Keep catalog edits and historical inquiry snapshots.
  }
}
