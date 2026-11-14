import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from "@nestjs/swagger";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { EventInput } from "./dto/request/create-event.request.dto.js";
import { EventsQuery } from "./dto/request/list-events.request.dto.js";
import { LinkEventGroupInput } from "./dto/request/link-event-group.request.dto.js";
import { UpdateEventInput } from "./dto/request/update-event.request.dto.js";
import { EventDto } from "./dto/response/event.response.dto.js";
import { EventsService } from "./events.service.js";

@ApiTags("events")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: [EventDto] })
  events(@CurrentUser() user: AuthUser, @Query() query: EventsQuery) {
    return this.eventsService.list(user.id, query.groupId);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: EventDto })
  createEvent(@CurrentUser() user: AuthUser, @Body() body: EventInput) {
    return this.eventsService.create(user.id, body);
  }
  @Get(":eventId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: EventDto })
  event(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.get(user.id, eventId);
  }
  @Put(":eventId/group")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: EventDto })
  linkGroup(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() body: LinkEventGroupInput,
  ) {
    return this.eventsService.linkGroup(user.id, eventId, body);
  }
  @Patch(":eventId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: EventDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() body: UpdateEventInput,
  ) {
    return this.eventsService.update(user.id, eventId, body);
  }
}
