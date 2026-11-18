import { MerchantInquiriesQuery } from "./merchant-inquiries.query.js";
import { SolapiWebhookDecoder } from "./providers/solapi-webhook.js";
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { MerchantLinksService } from "./merchant-links.service.js";
import { MerchantRepliesService } from "./merchant-replies.service.js";
import { MessageDeliveryService } from "./message-delivery.service.js";
import {
  MerchantAccessInput,
  MerchantReplyBody,
} from "./dto/request/merchant-reply.request.dto.js";
@Controller("api/v1/merchant-replies/:targetId")
export class MerchantRepliesController {
  constructor(
    private readonly links: MerchantLinksService,
    private readonly replies: MerchantRepliesService,
  ) {}
  @Post("access")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  access(
    @Param("targetId", ParseUUIDPipe) id: string,
    @Body() body: MerchantAccessInput,
    @Req() req: Request,
  ) {
    return this.links.exchange(id, body.token, req.ip ?? "unknown");
  }
  @Get()
  @Header("Cache-Control", "no-store")
  get(
    @Param("targetId", ParseUUIDPipe) id: string,
    @Headers("x-merchant-access") access?: string,
  ) {
    return this.replies.get(id, { kind: "link", access });
  }
  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  save(
    @Param("targetId", ParseUUIDPipe) id: string,
    @Body() body: MerchantReplyBody,
    @Req() req: Request,
    @Headers("x-merchant-access") access?: string,
  ) {
    return this.replies.save(
      id,
      { kind: "link", access },
      body.reply,
      req.ip ?? "unknown",
    );
  }
}
@Controller("api/v1/owner/inquiries")
@UseGuards(AccessGuard)
export class OwnerInquiriesController {
  constructor(
    private readonly replies: MerchantRepliesService,
    private readonly inquiries: MerchantInquiriesQuery,
  ) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.inquiries.list(user, cursor);
  }
  @Get(":id") get(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.replies.get(id, { kind: "owner", user });
  }
  @Post(":id") @HttpCode(200) save(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MerchantReplyBody,
    @Req() req: Request,
  ) {
    return this.replies.save(
      id,
      { kind: "owner", user },
      body.reply,
      req.ip ?? "unknown",
    );
  }
}
@Controller("api/v1/webhooks/solapi")
export class SolapiWebhookController {
  constructor(
    private readonly delivery: MessageDeliveryService,
    private readonly decoder: SolapiWebhookDecoder,
  ) {}
  @Post()
  @HttpCode(200)
  webhook(
    @Headers("x-solapi-signature") signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    return this.delivery.applyReports(
      this.decoder.decode(signature, req.rawBody),
    );
  }
}
