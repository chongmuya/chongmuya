import { EventsModule } from "./modules/events/events.module.js";
import { GroupsModule } from "./modules/groups/groups.module.js";
import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./modules/health/health.module.js";

import { AuthModule } from "./modules/auth/auth.module.js";

@Module({
  imports: [ConfigModule, HealthModule, AuthModule, GroupsModule, EventsModule],
})
export class AppModule {}
