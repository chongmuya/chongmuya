import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Header,
} from "@nestjs/common";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { HandoversService } from "./handovers.service.js";
import {
  HandoverInput,
  HandoverTokenInput,
  AcceptHandoverInput,
} from "./dto/request/handover.request.dto.js";
@UseGuards(AccessGuard)
@Controller("api/v1/handovers")
export class HandoversController {
  constructor(private readonly handovers: HandoversService) {}
  @Get("groups/:id") @Header("Cache-Control", "no-store") preview(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.handovers.preview(u.id, id);
  }
  @Post("groups/:id") @Header("Cache-Control", "no-store") create(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: HandoverInput,
  ) {
    return this.handovers.create(u.id, id, input);
  }
  @Post("groups/:groupId/:id/cancel") cancel(
    @CurrentUser() u: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.handovers.cancel(u.id, groupId, id);
  }
  @Post(":id/preview") @Header("Cache-Control", "no-store") incoming(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: HandoverTokenInput,
  ) {
    return this.handovers.incoming(u.id, id, input.token);
  }
  @Post(":id/accept") @Header("Cache-Control", "no-store") accept(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: AcceptHandoverInput,
  ) {
    return this.handovers.accept(u.id, id, input);
  }
}
