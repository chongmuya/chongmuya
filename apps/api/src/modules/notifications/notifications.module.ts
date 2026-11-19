import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { NotificationsService } from "./notifications.service.js";
@Module({
  imports: [DatabaseModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
