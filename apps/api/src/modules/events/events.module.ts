import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

@Module({
  imports: [DatabaseModule, ConfigModule, AuthModule, GroupsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
