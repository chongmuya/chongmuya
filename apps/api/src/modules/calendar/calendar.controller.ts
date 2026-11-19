import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { CalendarService } from "./calendar.service.js";
import {
  CalendarQuery,
  ScheduleInput,
  DeleteScheduleInput,
} from "./dto/request/calendar.request.dto.js";
@UseGuards(AccessGuard)
@Controller("api/v1/calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @CurrentUser() u: AuthUser,
    @Query() q: CalendarQuery,
  ) {
    return this.calendar.list(u.id, q);
  }
  @Get(":id") @Header("Cache-Control", "no-store") get(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.calendar.get(u.id, id);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() b: ScheduleInput) {
    return this.calendar.save(u.id, b);
  }
  @Post(":id") save(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: ScheduleInput,
  ) {
    return this.calendar.save(u.id, b, id);
  }
  @Post(":id/delete") remove(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() b: DeleteScheduleInput,
  ) {
    return this.calendar.remove(u.id, id, b.expectedVersion);
  }
}
