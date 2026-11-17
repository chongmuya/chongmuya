import { Body, Controller, Header, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PasswordResetService } from "./password-reset.service.js";
import {
  RequestPasswordResetDto,
  CheckPasswordResetDto,
  SavePasswordResetDto,
} from "./dto/request/password-reset.request.dto.js";
@Controller("api/v1/auth/password-reset")
export class PasswordResetController {
  constructor(private readonly reset: PasswordResetService) {}
  @Post("request")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  request(@Body() input: RequestPasswordResetDto, @Req() request: Request) {
    return this.reset.request(input.email, request.ip ?? "unknown");
  }
  @Post("check")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  check(@Body() input: CheckPasswordResetDto, @Req() request: Request) {
    return this.reset.check(input.token, request.ip ?? "unknown");
  }
  @Post("confirm")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  confirm(@Body() input: SavePasswordResetDto, @Req() request: Request) {
    return this.reset.reset(
      input.token,
      input.password,
      request.ip ?? "unknown",
    );
  }
}
