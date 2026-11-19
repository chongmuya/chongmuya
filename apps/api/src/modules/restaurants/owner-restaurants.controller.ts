import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { RestaurantManagementService } from "./restaurant-management.service.js";
import {
  HoursInput,
  AddressSearchInput,
  ContactCheckInput,
  ContactVerifyInput,
  DraftCreateInput,
  DraftSaveInput,
  DraftSubmitInput,
  MenuSaveInput,
} from "./dto/request/owner-restaurant.request.dto.js";
@Controller("api/v1/owner")
@UseGuards(AccessGuard)
export class OwnerRestaurantsController {
  constructor(private readonly management: RestaurantManagementService) {}
  @Get("restaurants/:id/hours") hours(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.management.hours(user, id);
  }
  @Put("restaurants/:id/hours") saveHours(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: HoursInput,
  ) {
    return this.management.saveHours(
      user,
      id,
      input.expectedVersion,
      input.hours,
    );
  }
  @Get("context") context(@CurrentUser() user: AuthUser) {
    return this.management.context(user);
  }
  @Post("drafts") begin(
    @CurrentUser() user: AuthUser,
    @Body() body: DraftCreateInput,
  ) {
    return this.management.begin(user, body.restaurantId);
  }
  @Get("drafts/:id") get(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.management.getDraft(user, id);
  }
  @Put("drafts/:id") save(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DraftSaveInput,
  ) {
    return this.management.saveDraft(user, id, body);
  }
  @Post("drafts/:id/addresses") search(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AddressSearchInput,
  ) {
    return this.management.search(user, id, body.query);
  }
  @Post("drafts/:id/duplicate") duplicate(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.management.checkDuplicate(user, id);
  }
  @Post("drafts/:id/contact-verification") verify(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ContactVerifyInput,
    @Req() req: Request,
  ) {
    return this.management.verifyPhone(
      user,
      id,
      body.phone,
      req.ip ?? "unknown",
    );
  }
  @Post("drafts/:id/contact-verification/check") check(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ContactCheckInput,
  ) {
    return this.management.checkPhone(
      user,
      id,
      body.phone,
      body.verificationId,
    );
  }
  @Post("drafts/:id/submit") submit(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DraftSubmitInput,
  ) {
    return this.management.submit(user, id, body.version);
  }
  @Get("restaurants/:id/menus") menus(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.management.menus(user, id);
  }
  @Put("restaurants/:id/menus") menu(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: MenuSaveInput,
  ) {
    return this.management.saveMenu(user, id, body.version, body.menu);
  }
}
