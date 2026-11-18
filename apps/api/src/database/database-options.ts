import path from "node:path";
import type { DataSourceOptions } from "typeorm";

export function databaseOptions(environment: {
  databaseUrl: string;
}): DataSourceOptions {
  return {
    type: "postgres",
    url: environment.databaseUrl,
    // Both Nest and the CLI run compiled JS, never a mix of src and dist.
    entities: [path.join(import.meta.dirname, "../modules/**/*.entity.js")],
    migrations: [path.join(import.meta.dirname, "migrations/*.js")],
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: false,
    poolSize: 5,
    connectTimeoutMS: 2_000,
    extra: { statement_timeout: 2_000 },
  };
}
