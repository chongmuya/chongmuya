import { HandoversModule } from "./modules/handovers/handovers.module.js";
import { FavoritesModule } from "./modules/favorites/favorites.module.js";
import { CalendarModule } from "./modules/calendar/calendar.module.js";
import { SettlementsModule } from "./modules/settlements/settlements.module.js";
import { RestaurantsModule } from "./modules/restaurants/restaurants.module.js";
import { ReservationsModule } from "./modules/reservations/reservations.module.js";
import { EventsModule } from "./modules/events/events.module.js";
import { GroupsModule } from "./modules/groups/groups.module.js";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./modules/health/health.module.js";

import { AuthModule } from "./modules/auth/auth.module.js";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HandoversModule,
    FavoritesModule,
    ConfigModule,
    HealthModule,
    AuthModule,
    GroupsModule,
    EventsModule,
    RestaurantsModule,
    ReservationsModule,
    SettlementsModule,
    CalendarModule,
  ],
})
export class AppModule {}
