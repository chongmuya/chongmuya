import "reflect-metadata";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { DataSource } from "typeorm";
import {
  parseProductionDatabaseEnvironment,
  rdsCaPath,
} from "../../config/database-environment.js";
import { databaseOptions } from "../database-options.js";
import { migrationState } from "../migration-state.js";
import { seedRestaurants } from "./restaurants.seed.js";
import fixture from "./data/restaurants.json" with { type: "json" };

let db: DataSource | undefined;
let failure = "운영 식당 시드는 옵션 없이 미리보기, --execute로만 반영합니다.";
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--execute"))
    throw new Error();
  failure =
    "NODE_ENV=production과 DATABASE_URL의 RDS TLS 설정·CA를 확인하세요.";
  const env = parseProductionDatabaseEnvironment(process.env);
  await access(rdsCaPath, constants.R_OK);
  db = new DataSource(databaseOptions(env));
  await db.initialize();
  failure =
    "미적용 migration이 있습니다. 같은 이미지로 migration을 먼저 적용하세요.";
  if ((await migrationState(db)).pending.length) throw new Error();
  failure =
    "식당 시드 충돌 또는 DB 오류입니다. 이번 실행은 반영되지 않았습니다.";
  const dryRun = args.length === 0;
  const result = await seedRestaurants(db, fixture, undefined, { dryRun });
  console.log(
    JSON.stringify({
      mode: dryRun ? "DRY_RUN" : "EXECUTED",
      host: env.host,
      database: env.database,
      ...result,
    }),
  );
} catch {
  console.error(failure);
  process.exitCode = 1;
} finally {
  if (db?.isInitialized) {
    try {
      await db.destroy();
    } catch {
      console.error("DB 연결 종료에 실패했습니다. 결과를 확인하세요.");
      process.exitCode = 1;
    }
  }
}
