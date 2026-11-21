import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ConfigService } from "../../config/config.service.js";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { clearSessionCookies } from "../auth/utils/session-cookies.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { AccountWithdrawalService } from "./account-withdrawal.service.js";
import { WithdrawalKeyDto } from "./dto/request/withdrawal-key.request.dto.js";

@Controller("api/v1/account/withdrawal")
export class AccountWithdrawalController {
  constructor(
    private readonly withdrawals: AccountWithdrawalService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(AccessGuard)
  @Header("Cache-Control", "no-store")
  status(@CurrentUser() user: AuthUser) {
    return this.withdrawals.status(user);
  }

  @Post("requests")
  @UseGuards(AccessGuard)
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  request(
    @CurrentUser() user: AuthUser,
    @Body() { requestKey }: WithdrawalKeyDto,
  ) {
    return this.withdrawals.request(user, requestKey);
  }

  @Post("complete")
  @UseGuards(AccessGuard)
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async complete(
    @CurrentUser() user: AuthUser,
    @Body() { requestKey }: WithdrawalKeyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.withdrawals.complete(user, requestKey);
    if (result.completed || ("pending" in result && result.pending))
      clearSessionCookies(
        response,
        this.config.environment.nodeEnv === "production",
      );
    return result;
  }

  // A fresh random key from the original browser confirms the outcome after a
  // lost response. The key grants no account, request or reservation access.
  @Post("receipt")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  receipt(@Body() { requestKey }: WithdrawalKeyDto) {
    return this.withdrawals.receipt(requestKey);
  }

  @Post("retry")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  retry(@Body() { requestKey }: WithdrawalKeyDto) {
    return this.withdrawals.retry(requestKey);
  }
}
