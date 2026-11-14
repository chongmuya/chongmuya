import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from "@nestjs/swagger";
import { AccessGuard } from "../auth/jwt-access.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { EventInput } from "./event-request.dto.js";
import { EventDto } from "./event-response.dto.js";
import { EventsService } from "./events.service.js";

@ApiTags("events")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/groups/:groupId/events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: [EventDto] })
  events(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.eventsService.list(user.id, groupId);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: EventDto })
  createEvent(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() body: EventInput,
  ) {
    return this.eventsService.create(user.id, groupId, body);
  }
  @Get(":eventId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: EventDto })
  event(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.get(user.id, groupId, eventId);
  }
}
