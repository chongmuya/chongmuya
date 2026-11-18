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
import { ReservationsService } from "./reservations.service.js";

@ApiTags("reservation-requests")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("api/v1/events/:eventId/reservation-requests")
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}
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
