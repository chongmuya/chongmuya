import "reflect-metadata";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { parseEnvironment } from "../config/environment.js";
import { databaseOptions } from "./database-options.js";

// CLI entry point only. Importing this file does not connect or apply migrations.
config({ quiet: true });
export default new DataSource(databaseOptions(parseEnvironment(process.env)));
