import {
  InvitationInput,
  InvitationTokenInput,
  EditGroupMemberInput,
} from "./dto/request/membership.request.dto.js";
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
import { CreateGroupInput } from "./dto/request/create-group.request.dto.js";
import { GroupDto, GroupMemberDto } from "./dto/response/group.response.dto.js";
import { AddGroupMembersInput } from "./dto/request/add-group-members.request.dto.js";
import { AddedGroupMembersDto } from "./dto/response/group.response.dto.js";
import { GroupsService } from "./groups.service.js";
@ApiTags("groups")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}
  @Get("memberships")
  memberships(@CurrentUser() user: AuthUser) {
    return this.groups.membershipBasics(user.id);
  }
  @Get(":groupId/accounts")
  accounts(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
  ) {
    return this.groups.membershipState(user.id, id);
  }
  @Post(":groupId/invitations")
  invite(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) id: string,
    @Body() input: InvitationInput,
  ) {
    return this.groups.invite(user.id, id, input);
  }
  @Post("invitations/:id/preview")
  invitation(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: InvitationTokenInput,
  ) {
    return this.groups.invitation(user.id, id, input.token);
  }
  @Post("invitations/:id/accept")
  acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: InvitationTokenInput,
  ) {
    return this.groups.invitation(user.id, id, input.token, true);
  }
  @Post(":groupId/invitations/:id/cancel")
  cancelInvitation(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.groups.cancelInvitation(user.id, groupId, id);
  }
  @Patch(":groupId/members/:memberId")
  editMember(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @Body() input: EditGroupMemberInput,
  ) {
    return this.groups.editMember(user.id, groupId, memberId, input);
  }
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: [GroupDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.groups.list(user.id);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: GroupDto })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateGroupInput) {
    return this.groups.create(user.id, body);
  }
  @Post(":groupId/members")
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: AddedGroupMembersDto })
  addMembers(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() body: AddGroupMembersInput,
  ) {
    return this.groups.addMembers(user.id, groupId, body);
  }
  @Get(":groupId/members")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: [GroupMemberDto] })
  members(
    @CurrentUser() user: AuthUser,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.groups.members(user.id, groupId);
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
