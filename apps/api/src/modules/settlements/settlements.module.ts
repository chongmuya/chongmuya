import { NotificationsModule } from "../notifications/notifications.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EventsModule } from "../events/events.module.js";
import { ReservationsModule } from "../reservations/reservations.module.js";
import { FilesModule } from "../files/files.module.js";
import { SettlementsService } from "./settlements.service.js";
import { SettlementsController } from "./settlements.controller.js";
@Module({
  imports: [
    NotificationsModule,
    DatabaseModule,
    ConfigModule,
    AuthModule,
    EventsModule,
    ReservationsModule,
    FilesModule,
  ],
  providers: [SettlementsService],
  controllers: [SettlementsController],
  exports: [SettlementsService],
})
export class SettlementsModule {}
