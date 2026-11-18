import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { EventsModule } from "../events/events.module.js";
import { RestaurantsModule } from "../restaurants/restaurants.module.js";
import { ReservationsController } from "./reservations.controller.js";
import { ReservationsService } from "./reservations.service.js";
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    GroupsModule,
    EventsModule,
    RestaurantsModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
