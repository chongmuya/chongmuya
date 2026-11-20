import { ReservationsModule } from "../reservations/reservations.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { RemindersService } from "./reminders.service.js";
import { ReminderSchedulerService } from "./reminder-scheduler.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EventsModule } from "../events/events.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { CalendarService } from "./calendar.service.js";
import { CalendarController } from "./calendar.controller.js";
@Module({
  imports: [
    ReservationsModule,
    ConfigModule,
    DatabaseModule,
    AuthModule,
    EventsModule,
    GroupsModule,
    NotificationsModule,
  ],
  controllers: [CalendarController],
  providers: [CalendarService, RemindersService, ReminderSchedulerService],
  exports: [CalendarService],
})
export class CalendarModule {}
