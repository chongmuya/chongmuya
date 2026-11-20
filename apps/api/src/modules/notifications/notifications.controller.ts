import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { NotificationsService } from "./notifications.service.js";
import {
  InboxQuery,
  ReadInboxInput,
  NotificationPreferencesInput,
} from "./dto/request/inbox.request.dto.js";
@UseGuards(AccessGuard)
@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list(@CurrentUser() user: AuthUser, @Query() query: InboxQuery) {
    return this.notifications.inbox(user.id, query.before);
  }
  @Get("unread")
  @Header("Cache-Control", "no-store")
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.inbox(user.id, undefined, true);
  }
  @Post("read")
  read(@CurrentUser() user: AuthUser, @Body() input: ReadInboxInput) {
    return this.notifications.read(user.id, input);
  }
  @Get("preferences")
  @Header("Cache-Control", "no-store")
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user.id);
  }
  @Post("preferences")
  save(
    @CurrentUser() user: AuthUser,
    @Body() input: NotificationPreferencesInput,
  ) {
    return this.notifications.savePreferences(user.id, input);
  }
}
