import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import type { ReadinessDto } from "./health.dto.js";

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async readiness(): Promise<ReadinessDto> {
    try {
      const dataSource = await this.database.connect();
      await dataSource.query("SELECT 1");
      return { status: "ok", service: "chongmuya-api", database: "up" };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
