import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { RestaurantsModule } from "../restaurants/restaurants.module.js";
import { ReservationsModule } from "../reservations/reservations.module.js";
import { AccountWithdrawalController } from "./account-withdrawal.controller.js";
import { AccountWithdrawalService } from "./account-withdrawal.service.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    GroupsModule,
    RestaurantsModule,
    ReservationsModule,
  ],
  controllers: [AccountWithdrawalController],
  providers: [AccountWithdrawalService],
})
export class AccountWithdrawalModule {}
