import { MerchantLinksService } from "./merchant-links.service.js";
import { MerchantRepliesService } from "./merchant-replies.service.js";
import { MessageDeliveryService } from "./message-delivery.service.js";
import { MessageProvider } from "./providers/message.provider.js";
import {
  MerchantRepliesController,
  OwnerInquiriesController,
  SolapiWebhookController,
} from "./merchant-replies.controller.js";
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
  controllers: [
    ReservationsController,
    MerchantRepliesController,
    OwnerInquiriesController,
    SolapiWebhookController,
  ],
  providers: [
    ReservationsService,
    MerchantLinksService,
    MerchantRepliesService,
    MessageDeliveryService,
    MessageProvider,
  ],
})
export class ReservationsModule {}
