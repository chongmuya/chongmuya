import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AccessGuard } from "./guards/jwt-access.guard.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import type { AuthUser } from "./types/auth-user.js";
import { ProfileService } from "./profile.service.js";
import {
  ProfileInput,
  OwnerDepositAccountInput,
  PhoneChangeInput,
  VerifyPhoneChangeInput,
} from "./dto/request/profile.request.dto.js";
@UseGuards(AccessGuard)
@Controller("api/v1/auth/profile")
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}
  @Post() save(@CurrentUser() u: AuthUser, @Body() b: ProfileInput) {
    return this.profile.save(u, b);
  }
  @Get("deposit-account")
  @Header("Cache-Control", "no-store")
  depositAccount(@CurrentUser() u: AuthUser) {
    return this.profile.depositAccount(u);
  }
  @Put("deposit-account")
  @Header("Cache-Control", "no-store")
  saveDepositAccount(
    @CurrentUser() u: AuthUser,
    @Body() b: OwnerDepositAccountInput,
  ) {
    return this.profile.saveDepositAccount(u, b);
  }
  @Post("phone") issue(
    @CurrentUser() u: AuthUser,
    @Body() b: PhoneChangeInput,
    @Req() req: Request,
  ) {
    return this.profile.issue(u, b.phone, req.ip ?? "unknown");
  }
  @Post("phone/verify") verify(
    @CurrentUser() u: AuthUser,
    @Body() b: VerifyPhoneChangeInput,
  ) {
    return this.profile.verify(u, b.id, b.phone);
  }
}
