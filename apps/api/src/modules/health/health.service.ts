import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import type { ReadinessDto } from "./dto/response/readiness.response.dto.js";

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async readiness(): Promise<ReadinessDto> {
    const dataSource = await this.database.connect();
    await dataSource.query("SELECT 1");
    return { status: "ok", service: "chongmuya-api", database: "up" };
  }
}
