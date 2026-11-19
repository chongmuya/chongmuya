import "reflect-metadata";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { parseDatabaseEnvironment } from "../config/database-environment.js";
import { databaseOptions } from "./database-options.js";

// CLI entry point only. Importing this file does not connect or apply migrations.
config({ quiet: true });
const options = databaseOptions(parseDatabaseEnvironment(process.env));
export default new DataSource({
  ...options,
  // DDL can exceed the API's 2s budget. Bound execution and lock waits separately.
  extra: { ...options.extra, statement_timeout: 60_000, lock_timeout: 5_000 },
});
