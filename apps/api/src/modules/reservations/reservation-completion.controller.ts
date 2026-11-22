import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { ReservationCompletionBody } from "./dto/request/reservation-completion.request.dto.js";
import { MerchantAccessInput } from "./dto/request/merchant-reply.request.dto.js";
import { ReservationCompletionService } from "./reservation-completion.service.js";
import { ReservationMenusService } from "./reservation-menus.service.js";
import { ReservationPaymentsService } from "./reservation-payments.service.js";
import { ReservationChangesService } from "./reservation-changes.service.js";
import { ReservationAccessService } from "./reservation-access.service.js";
import type { ReservationPrincipal } from "./types/reservation-completion.js";
@Injectable()
export class ReservationCommands {
  constructor(
    private readonly menus: ReservationMenusService,
    private readonly payments: ReservationPaymentsService,
    private readonly changes: ReservationChangesService,
  ) {}
  run(action: string, id: string, p: ReservationPrincipal, input: unknown) {
    const commands: Record<
      string,
      () => ReturnType<ReservationMenusService["draft"]>
    > = {
      "menu-draft": () => this.menus.draft(id, p, input),
      "menu-submit": () => this.menus.submit(id, p, input),
      guidance: () => this.payments.guidance(id, p, input),
      acknowledge: () => this.payments.acknowledge(id, p, input),
      transfer: () => this.payments.transfer(id, p, input),
      receipt: () => this.payments.receipt(id, p, input),
      resolve: () => this.payments.resolve(id, p, input),
      "change-request": () => this.changes.request(id, p, input),
      "change-propose": () => this.changes.propose(id, p, input),
      "change-accept": () => this.changes.accept(id, p, input),
      "change-decline": () => this.changes.decline(id, p, input),
      "change-reject": () => this.changes.reject(id, p, input),
      refund: () => this.changes.refund(id, p, input),
      "refund-plan": () => this.changes.refundPlan(id, p, input),
    };
    if (!Object.hasOwn(commands, action))
      throw new DomainHttpException("VALIDATION_FAILED");
    return commands[action]!();
  }
}
@Controller("api/v1/reservations")
@UseGuards(AccessGuard)
export class OrganizerReservationsController {
  constructor(
    private readonly completion: ReservationCompletionService,
    private readonly commands: ReservationCommands,
  ) {}
  @Get(":id/contact") @Header("Cache-Control", "no-store") contact(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.completion.contact(id, { kind: "organizer", user });
  }
  @Get(":id") @Header("Cache-Control", "no-store") get(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.completion.get(id, { kind: "organizer", user });
  }
  @Post(":id/:action") @HttpCode(200) command(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("action") action: string,
    @CurrentUser() user: AuthUser,
    @Body() body: ReservationCompletionBody,
  ) {
    return this.commands.run(
      action,
      id,
      { kind: "organizer", user },
      body.command,
    );
  }
}
@Controller("api/v1/owner/reservations")
@UseGuards(AccessGuard)
export class OwnerReservationsController {
  constructor(
    private readonly completion: ReservationCompletionService,
    private readonly commands: ReservationCommands,
  ) {}
  @Get(":id/contact") @Header("Cache-Control", "no-store") contact(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.completion.contact(id, { kind: "owner", user });
  }
  @Get() @Header("Cache-Control", "no-store") list(
    @CurrentUser() user: AuthUser,
  ) {
    return this.completion.list({ kind: "owner", user });
  }
  @Get(":id") @Header("Cache-Control", "no-store") get(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.completion.get(id, { kind: "owner", user });
  }
  @Post(":id/:action") @HttpCode(200) command(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("action") action: string,
    @CurrentUser() user: AuthUser,
    @Body() body: ReservationCompletionBody,
  ) {
    return this.commands.run(action, id, { kind: "owner", user }, body.command);
  }
}
@Controller("api/v1/reservation-management/:id")
export class ReservationManagementController {
  constructor(
    private readonly completion: ReservationCompletionService,
    private readonly commands: ReservationCommands,
    private readonly access: ReservationAccessService,
  ) {}
  @Get("contact") @Header("Cache-Control", "no-store") contact(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("x-reservation-access") access?: string,
  ) {
    return this.completion.contact(id, { kind: "link", access });
  }
  @Post("access") @HttpCode(200) @Header("Cache-Control", "no-store") exchange(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MerchantAccessInput,
    @Req() req: Request,
  ) {
    return this.access.exchange(id, body.token, req.ip ?? "unknown");
  }
  @Get() @Header("Cache-Control", "no-store") get(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("x-reservation-access") access?: string,
  ) {
    return this.completion.get(id, { kind: "link", access });
  }
  @Post(":action") @HttpCode(200) @Header("Cache-Control", "no-store") command(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("action") action: string,
    @Body() body: ReservationCompletionBody,
    @Headers("x-reservation-access") access?: string,
  ) {
    return this.commands.run(
      action,
      id,
      { kind: "link", access },
      body.command,
    );
  }
}
