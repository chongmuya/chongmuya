import { AuthModule } from "../auth/auth.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { RestaurantManagementService } from "./restaurant-management.service.js";
import { GeocodingProvider } from "./providers/geocoding.provider.js";
import { OwnerRestaurantsController } from "./owner-restaurants.controller.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { RestaurantsController } from "./restaurants.controller.js";
import { RestaurantsService } from "./restaurants.service.js";
@Module({
  imports: [DatabaseModule, ConfigModule, AuthModule],
  controllers: [RestaurantsController, OwnerRestaurantsController],
  providers: [
    RestaurantsService,
    RestaurantManagementService,
    GeocodingProvider,
  ],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
