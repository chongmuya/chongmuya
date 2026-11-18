import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { localDatabaseEnvironmentSchema } from "../../config/database-environment.js";
import { databaseOptions } from "../database-options.js";
import fixture from "./data/restaurants.json" with { type: "json" };
import { seedRestaurants } from "./restaurants.seed.js";
import { seedDemoRestaurants } from "./restaurants-demo.seed.js";

// Offline entry point. Never bootstrap the HTTP app, auth or message providers.

let failureMessage = "시드 실행 옵션을 확인하세요.";

async function runSeed(): Promise<void> {
  config({ quiet: true });
  const [name, ...args] = process.argv.slice(2);
  if (
    !["restaurants", "restaurants-demo"].includes(name ?? "") ||
    !(
      args.length === 0 ||
      (name === "restaurants" &&
        args.length === 2 &&
        args[0] === "--contacts-file" &&
        args[1])
    )
  )
    throw new Error();

  failureMessage =
    "로컬 PostgreSQL DATABASE_URL(쿼리 옵션 제외)과 NODE_ENV를 확인하세요. 운영 환경은 지원하지 않습니다.";
  const env = localDatabaseEnvironmentSchema.parse(process.env);
  failureMessage =
    "연락처 파일을 읽지 못했습니다. 파일 경로와 JSON 형식을 확인하세요.";
  const contacts: unknown = args[1]
    ? JSON.parse(await readFile(args[1], "utf8"))
    : undefined;

  const db = new DataSource(databaseOptions({ databaseUrl: env.DATABASE_URL }));
  try {
    failureMessage = "로컬 시드 DB에 연결하지 못했습니다.";
    await db.initialize();
    failureMessage = "DB migration을 먼저 적용한 뒤 시드를 실행하세요.";
    if (await db.showMigrations()) throw new Error();
    failureMessage =
      "시드를 저장하지 못했습니다. 시드·연락처 형식과 DB 스키마를 확인하세요. 이번 저장은 롤백됩니다.";
    if (name === "restaurants") await seedRestaurants(db, fixture, contacts);
    else await seedDemoRestaurants(db);
    failureMessage =
      "시드는 저장됐지만 DB 연결 종료에 실패했습니다. 기존 행을 보존하므로 재실행할 수 있습니다.";
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}

runSeed().then(
  () => {
    console.log("시드의 누락된 행을 추가했습니다. 기존 데이터는 보존했습니다.");
  },
  () => {
    // Never print raw errors: SQL, input, file paths or DB URLs may be private.
    console.error(failureMessage);
    process.exitCode = 1;
  },
);
