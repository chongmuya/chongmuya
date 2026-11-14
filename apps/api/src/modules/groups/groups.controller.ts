import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { GroupInput } from "./dto/request/group-name.request.dto.js";
import { GroupDto } from "./dto/response/group.response.dto.js";
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
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user.id);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: GroupDto })
  create(@CurrentUser() user: AuthUser, @Body() body: GroupInput) {
    return this.groups.create(user.id, body);
  }
  @Get(":groupId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: GroupDto })
  get(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.get(user.id, groupId);
  }
  @Patch(":groupId")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: GroupDto })
  rename(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() body: GroupInput,
  ) {
    return this.groups.rename(user.id, groupId, body);
  }
}
