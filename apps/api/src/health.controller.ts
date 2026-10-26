import { Controller, Get, Header } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health")
  @Header("Cache-Control", "no-store")
  health() {
    return { status: "ok", service: "chongmuya-api" };
  }
}
