import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { AttendanceService } from "./attendance.service.js";
import { EventRosterService } from "./event-roster.service.js";
import {
  AddEventParticipantsInput,
  UpdateEventParticipantInput,
} from "./dto/request/event-participants.request.dto.js";
import {
  CreateRoundInput,
  ResolveAttendanceInput,
  SetAttendanceInput,
} from "./dto/request/attendance.request.dto.js";

@ApiTags("attendance")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/events/:eventId")
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly roster: EventRosterService,
  ) {}
  @Get("participants")
  @Header("Cache-Control", "no-store")
  participants(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
  ) {
    return this.roster.list(u.id, event);
  }
  @Post("participants")
  @Header("Cache-Control", "no-store")
  add(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Body() input: AddEventParticipantsInput,
  ) {
    return this.roster.add(u.id, event, input);
  }
  @Post("participants/import-group")
  @Header("Cache-Control", "no-store")
  importGroup(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
  ) {
    return this.roster.importGroup(u.id, event);
  }
  @Patch("participants/:participantId")
  @Header("Cache-Control", "no-store")
  update(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Param("participantId", ParseUUIDPipe) person: string,
    @Body() input: UpdateEventParticipantInput,
  ) {
    return this.roster.update(u.id, event, person, input);
  }
  @Get("attendance-rounds")
  @Header("Cache-Control", "no-store")
  rounds(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
  ) {
    return this.attendance.list(u.id, event);
  }
  @Post("attendance-rounds")
  @Header("Cache-Control", "no-store")
  create(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Body() input: CreateRoundInput,
  ) {
    return this.attendance.create(u.id, event, input);
  }
  @Get("attendance-rounds/:roundId")
  @Header("Cache-Control", "no-store")
  detail(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Param("roundId", ParseUUIDPipe) round: string,
  ) {
    return this.attendance.get(u.id, event, round);
  }
  @Post("attendance-rounds/:roundId/close")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  close(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Param("roundId", ParseUUIDPipe) round: string,
  ) {
    return this.attendance.close(u.id, event, round);
  }
  @Put("attendance-rounds/:roundId/responses/:participantId")
  @Header("Cache-Control", "no-store")
  set(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Param("roundId", ParseUUIDPipe) round: string,
    @Param("participantId", ParseUUIDPipe) person: string,
    @Body() input: SetAttendanceInput,
  ) {
    return this.attendance.setOverride(u.id, event, round, person, input);
  }
  @Post("attendance-rounds/:roundId/reviews/:reviewId/resolve")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  resolve(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) event: string,
    @Param("roundId", ParseUUIDPipe) round: string,
    @Param("reviewId", ParseUUIDPipe) review: string,
    @Body() input: ResolveAttendanceInput,
  ) {
    return this.attendance.resolve(u.id, event, round, review, input);
  }
}
