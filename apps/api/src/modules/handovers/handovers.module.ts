import { ConfigModule } from "../../config/config.module.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { EventsModule } from "../events/events.module.js";
import { FilesModule } from "../files/files.module.js";
import { SettlementsModule } from "../settlements/settlements.module.js";
import { CalendarModule } from "../calendar/calendar.module.js";
import { ReservationsModule } from "../reservations/reservations.module.js";
import { HandoversService } from "./handovers.service.js";
import { HandoversController } from "./handovers.controller.js";
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    GroupsModule,
    EventsModule,
    FilesModule,
    SettlementsModule,
    CalendarModule,
    ReservationsModule,
  ],
  providers: [HandoversService],
  controllers: [HandoversController],
})
export class HandoversModule {}
