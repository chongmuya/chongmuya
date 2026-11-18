import db from "../dist/database/data-source.js";
import { seedDevelopmentRestaurants } from "../dist/modules/restaurants/development-seed.js";

try {
  const url = new URL(process.env.DATABASE_URL);
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error();
  await db.initialize();
  if (await db.showMigrations()) throw new Error();
  await seedDevelopmentRestaurants(db);
  console.log(
    "가상 매장 4곳의 개발 시드를 확인했습니다. 실제 연락·발송 대상이 아닙니다.",
  );
} catch {
  console.error(
    "개발 시드를 적용하지 못했습니다. 로컬 DATABASE_URL, NODE_ENV와 migration 적용 여부를 확인하세요.",
  );
  process.exitCode = 1;
} finally {
  if (db.isInitialized) await db.destroy();
}
