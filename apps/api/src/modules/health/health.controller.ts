import { Controller, Get, Header } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { ErrorResponseDto } from "../../common/http/error-response.dto.js";
import { HealthDto, ReadinessDto } from "./health.dto.js";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: HealthDto, description: "프로세스 liveness; DB 상태와 독립적" })
  health(): HealthDto {
    return { status: "ok", service: "chongmuya-api" };
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: ReadinessDto, description: "실제 PostgreSQL 쿼리 성공" })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  readiness(): Promise<ReadinessDto> {
    return this.healthService.readiness();
  }
}
