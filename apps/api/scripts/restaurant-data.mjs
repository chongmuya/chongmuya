import "reflect-metadata";
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { DataSource } from "typeorm";
import { DatabaseService } from "../dist/database/database.service.js";
import { databaseOptions } from "../dist/database/database-options.js";
import { migrationState } from "../dist/database/migration-state.js";
import {
  localDatabaseEnvironmentSchema,
  parseDeploymentDatabase,
} from "../dist/config/database-environment.js";
import { RestaurantDataService } from "../dist/modules/restaurants/restaurant-data.service.js";
import {
  restaurantDataKey,
  RestaurantDataError,
} from "../dist/modules/restaurants/types/restaurant-data.js";
import { privateRestaurantInput } from "./restaurant-data-input.mjs";
import { operationId, requireOperator } from "./merchant-cli.mjs";

config({ quiet: true });
let db;
try {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: "string" },
      id: { type: "string" },
      key: { type: "string" },
      actor: { type: "string" },
      reason: { type: "string" },
      execute: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (v.help)
    console.log(`data:restaurants import|update --file 비공개JSON --actor 실행자 --reason 사유 [--execute]
data:restaurants show [--id UUID | --key 고정키]
기본은 DB 쓰기가 없는 미리보기입니다. 입력은 0600 일반 파일, 최대 1MiB입니다.
show는 최대 100개 매장의 ID/version 또는 지정 매장의 자원 ID를 표시합니다. 연락처 번호는 출력하지 않습니다.`);
  else {
    const action = positionals[0];
    if (
      positionals.length !== 1 ||
      !["import", "update", "show"].includes(action)
    )
      throw new RestaurantDataError("INVALID_COMMAND");
    if (action === "show") {
      if (v.file || v.actor || v.reason || v.execute || (v.id && v.key))
        throw new RestaurantDataError("INVALID_COMMAND");
      if (v.id) operationId(v.id);
      if (v.key) restaurantDataKey.parse(v.key);
    } else {
      requireOperator(v);
      if (!v.file || v.id || v.key)
        throw new RestaurantDataError("INVALID_COMMAND");
    }
    const raw =
      action === "show" ? undefined : await privateRestaurantInput(v.file);
    const env =
      process.env.NODE_ENV === "production"
        ? parseDeploymentDatabase(process.env.DATABASE_URL, "app")
        : {
            databaseUrl: localDatabaseEnvironmentSchema.parse(process.env)
              .DATABASE_URL,
          };
    db = new DataSource(databaseOptions(env));
    await db.initialize();
    if ((await migrationState(db)).pending.length)
      throw new RestaurantDataError("MIGRATIONS_REQUIRED");
    const service = new RestaurantDataService(new DatabaseService(db));
    const result =
      action === "show"
        ? await service.show(
            v.id || v.key ? { id: v.id, key: v.key } : undefined,
          )
        : await service[action](raw, {
            actor: v.actor,
            reason: v.reason,
            execute: v.execute,
          });
    console.log(JSON.stringify(result));
  }
} catch (error) {
  const allowed = [
    "VALIDATION_FAILED",
    "RESTAURANT_VERSION_CONFLICT",
    "RESTAURANT_DUPLICATE",
    "RESTAURANT_NOT_FOUND",
    "RESOURCE_TARGET_CONFLICT",
    "POLICY_DESCRIPTION_OVERRIDDEN",
    "INVALID_OPERATOR",
    "INVALID_COMMAND",
    "MIGRATIONS_REQUIRED",
  ];
  console.error(
    JSON.stringify({
      error: allowed.includes(error?.code)
        ? error.code
        : "DATA_OPERATION_FAILED",
      fields:
        error instanceof RestaurantDataError ? error.fields.slice(0, 20) : [],
    }),
  );
  console.error(
    "입력 형식·0600 파일·DB 설정·migration·현재 version을 확인하세요. 원문 오류는 출력하지 않습니다.",
  );
  process.exitCode = 1;
} finally {
  if (db?.isInitialized)
    await db.destroy().catch(() => {
      console.error("DB 연결 종료 실패");
      process.exitCode = 1;
    });
}
