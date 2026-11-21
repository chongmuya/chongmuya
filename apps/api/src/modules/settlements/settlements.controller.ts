import {
  Controller,
  UseGuards,
  Get,
  Delete,
  Post,
  Param,
  ParseUUIDPipe,
  Header,
  Body,
  HttpCode,
  Query,
} from "@nestjs/common";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { SettlementsService } from "./settlements.service.js";
import { SettlementCommandInput } from "./dto/request/settlement.request.dto.js";
import { RemoveEventParticipantInput } from "./dto/request/remove-event-participant.request.dto.js";
import { RecordsQuery } from "./dto/request/records.request.dto.js";
import {
  EventSummariesQuery,
  MemberHistoryQuery,
} from "./dto/request/summary.request.dto.js";
@Controller("api/v1")
@UseGuards(AccessGuard)
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}
  @Delete("events/:eventId/participants/:participantId")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  removeParticipant(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("participantId", ParseUUIDPipe) participantId: string,
    @Body() input: RemoveEventParticipantInput,
    @Query("roundId", new ParseUUIDPipe({ optional: true })) roundId?: string,
  ) {
    return this.service.removeEventParticipant(
      u.id,
      eventId,
      participantId,
      input.expectedVersion,
      roundId,
    );
  }
  @Get("settlements/summaries")
  @Header("Cache-Control", "no-store")
  summaries(@CurrentUser() u: AuthUser, @Query() q: EventSummariesQuery) {
    return this.service.summaries(u.id, q.eventIds);
  }
  @Get("groups/:groupId/members/:memberId/history")
  @Header("Cache-Control", "no-store")
  memberHistory(
    @CurrentUser() u: AuthUser,
    @Param("groupId", ParseUUIDPipe) group: string,
    @Param("memberId", ParseUUIDPipe) member: string,
    @Query() q: MemberHistoryQuery,
  ) {
    return this.service.memberHistory(u.id, group, member, q.offset);
  }
  @Get("events/:eventId/settlement") @Header("Cache-Control", "no-store") get(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
  ) {
    return this.service.get(u.id, e);
  }
  @Post("events/:eventId/settlement")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  command(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
    @Body() b: SettlementCommandInput,
  ) {
    return this.service.command(u.id, e, b.command);
  }
  @Get("events/:eventId/settlement/notices/:id")
  @Header("Cache-Control", "no-store")
  notice(
    @CurrentUser() u: AuthUser,
    @Param("eventId", ParseUUIDPipe) e: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.service.notice(u.id, e, id);
  }
  @Get("records") @Header("Cache-Control", "no-store") records(
    @CurrentUser() u: AuthUser,
    @Query() q: RecordsQuery,
  ) {
    return this.service.records(u.id, q);
  }
}
