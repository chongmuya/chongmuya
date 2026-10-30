import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./modules/health/health.module.js";

import { AuthModule } from "./modules/auth/auth.module.js";

@Module({
  imports: [ConfigModule, HealthModule, AuthModule],
})
export class AppModule {}
