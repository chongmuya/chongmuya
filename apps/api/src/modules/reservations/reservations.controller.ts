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
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { CreateReservationRequestInput } from "./dto/request/create-reservation-request.request.dto.js";
import { ReservationQueriesService } from "./reservation-queries.service.js";
import { ReservationSelectionService } from "./reservation-selection.service.js";
import { ReservationDecisionInput } from "./dto/request/reservation-decision.request.dto.js";
import { ReservationsService } from "./reservations.service.js";

@ApiTags("reservation-requests")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/events/:eventId/reservation-requests")
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly queries: ReservationQueriesService,
    private readonly selection: ReservationSelectionService,
  ) {}
  @Get(":requestId")
  @Header("Cache-Control", "no-store")
  getRound(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
  ) {
    return this.queries.get(user.id, eventId, requestId);
  }
  @Post(":requestId/select")
  @Header("Cache-Control", "no-store")
  async select(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() input: ReservationDecisionInput,
  ) {
    await this.selection.decide(user.id, eventId, requestId, "SELECT", input);
    return this.queries.get(user.id, eventId, requestId);
  }
  @Post(":requestId/decline")
  @Header("Cache-Control", "no-store")
  async decline(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() input: ReservationDecisionInput,
  ) {
    await this.selection.decide(user.id, eventId, requestId, "DECLINE", input);
    return this.queries.get(user.id, eventId, requestId);
  }
  @Get()
  @Header("Cache-Control", "no-store")
  async get(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return { request: await this.reservations.get(user.id, eventId) };
  }
  @Post()
  @Header("Cache-Control", "no-store")
  create(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Body() input: CreateReservationRequestInput,
  ) {
    return this.reservations.create(user, eventId, input);
  }
}
