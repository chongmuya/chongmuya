import "reflect-metadata";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { parseDatabaseEnvironment } from "../config/database-environment.js";
import { databaseOptions } from "./database-options.js";

// CLI entry point only. Importing this file does not connect or apply migrations.
config({ quiet: true });
export default new DataSource(
  databaseOptions(parseDatabaseEnvironment(process.env)),
);
