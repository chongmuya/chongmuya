import { Injectable } from "@nestjs/common";
import { config } from "dotenv";
import { parseEnvironment } from "./environment.js";

@Injectable()
export class ConfigService {
  readonly environment;

  constructor() {
    // pnpm runs app scripts in apps/api; existing process variables take priority.
    config({ quiet: true });
    this.environment = parseEnvironment(process.env);
  }
}
