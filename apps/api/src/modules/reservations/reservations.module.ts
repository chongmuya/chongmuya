import { NotificationsModule } from "../notifications/notifications.module.js";
import { ReservationLocksService } from "./reservation-locks.service.js";
import { ReservationQueriesService } from "./reservation-queries.service.js";
import { ReservationSelectionService } from "./reservation-selection.service.js";
import { ReservationNotificationsService } from "./reservation-notifications.service.js";
import { MerchantInquiriesQuery } from "./merchant-inquiries.query.js";
import { SolapiWebhookDecoder } from "./providers/solapi-webhook.js";
import { FakeMessageGateway } from "./providers/fake-message.gateway.js";
import { SolapiMessageGateway } from "./providers/solapi-message.gateway.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MerchantRepliesService } from "./merchant-replies.service.js";
import { MessageDeliveryService } from "./message-delivery.service.js";
import { MessageGateway } from "./providers/message.gateway.js";
import {
  MerchantRepliesController,
  OwnerInquiriesController,
  SolapiWebhookController,
} from "./merchant-replies.controller.js";
import { ConfigService } from "../../config/config.service.js";
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
    NotificationsModule,
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
    ReservationLocksService,
    ReservationQueriesService,
    ReservationSelectionService,
    ReservationNotificationsService,
    SolapiWebhookDecoder,
    MerchantInquiriesQuery,
    MerchantLinksService,
    MerchantRepliesService,
    MessageDeliveryService,
    {
      provide: MessageGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.environment.messageProvider === "solapi"
          ? new SolapiMessageGateway(config)
          : new FakeMessageGateway(),
    },
  ],
})
export class ReservationsModule {}
