import { NotificationsModule } from "../notifications/notifications.module.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { AttendanceService } from "./attendance.service.js";
import { EventRosterService } from "./event-roster.service.js";
import { AttendanceController } from "./attendance.controller.js";
import { PublicAttendanceController } from "./public-attendance.controller.js";

@Module({
  imports: [
    NotificationsModule,
    DatabaseModule,
    ConfigModule,
    AuthModule,
    GroupsModule,
  ],
  controllers: [
    EventsController,
    AttendanceController,
    PublicAttendanceController,
  ],
  providers: [EventsService, AttendanceService, EventRosterService],
  exports: [EventsService, EventRosterService],
})
export class EventsModule {}
