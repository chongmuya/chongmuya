import { ConfigModule } from "../../config/config.module.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { RestaurantsModule } from "../restaurants/restaurants.module.js";
import { FavoritesService } from "./favorites.service.js";
import { FavoritesController } from "./favorites.controller.js";
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    GroupsModule,
    RestaurantsModule,
  ],
  providers: [FavoritesService],
  controllers: [FavoritesController],
  exports: [FavoritesService],
})
export class FavoritesModule {}
