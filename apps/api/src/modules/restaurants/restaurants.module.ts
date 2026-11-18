import { FakeGeocoder } from "./providers/fake.geocoder.js";
import { NaverGeocoder } from "./providers/naver.geocoder.js";
import { AuthModule } from "../auth/auth.module.js";
import { ConfigModule } from "../../config/config.module.js";
import { RestaurantManagementService } from "./restaurant-management.service.js";
import { Geocoder } from "./providers/geocoder.js";
import { OwnerRestaurantsController } from "./owner-restaurants.controller.js";
import { ConfigService } from "../../config/config.service.js";
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
    {
      provide: Geocoder,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.environment.geocodingProvider === "naver"
          ? new NaverGeocoder(config)
          : new FakeGeocoder(),
    },
  ],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
