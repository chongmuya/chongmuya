import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from "@nestjs/swagger";
import { AccessGuard } from "../auth/auth.module.js";
import type { AuthRequest } from "../auth/auth.module.js";
import { GroupInput, EventInput, GroupDto, EventDto } from "./group.dto.js";
import { GroupsService } from "./groups.service.js";
@ApiTags("groups")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: [GroupDto] })
  list(@Req() req: AuthRequest) {
    return this.groups.list(owner(req));
  }
  @Post()
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: GroupDto })
  create(@Req() req: AuthRequest, @Body() body: GroupInput) {
    return this.groups.create(owner(req), body);
  }
  @Get(":groupId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: GroupDto })
  get(
    @Req() req: AuthRequest,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.get(owner(req), groupId);
  }
  @Patch(":groupId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: GroupDto })
  rename(
    @Req() req: AuthRequest,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() body: GroupInput,
  ) {
    return this.groups.rename(owner(req), groupId, body);
  }
  @Get(":groupId/events")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: [EventDto] })
  events(
    @Req() req: AuthRequest,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.events(owner(req), groupId);
  }
  @Post(":groupId/events")
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: EventDto })
  createEvent(
    @Req() req: AuthRequest,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() body: EventInput,
  ) {
    return this.groups.createEvent(owner(req), groupId, body);
  }
  @Get(":groupId/events/:eventId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: EventDto })
  event(
    @Req() req: AuthRequest,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return this.groups.event(owner(req), groupId, eventId);
  }
}

function owner(req: AuthRequest): string {
  if (!req.user) throw new UnauthorizedException();
  return req.user.id;
}
