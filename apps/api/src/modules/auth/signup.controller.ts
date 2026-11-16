import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiResponse, ApiTags } from "@nestjs/swagger";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { ConfigService } from "../../config/config.service.js";
import { PhoneVerificationService } from "./phone-verification.service.js";
import { SignupTermsService } from "./signup-terms.service.js";
import {
  CancelPhoneVerificationDto,
  CheckPhoneVerificationDto,
  CreatePhoneVerificationDto,
} from "./dto/request/phone-verification.request.dto.js";
import { cookie, signupCookieName } from "./utils/auth-cookies.js";
import {
  CreatedPhoneVerificationDto,
  PhoneVerificationDto,
} from "./dto/response/phone-verification.response.dto.js";
import { SignupTermsDto } from "./dto/response/signup-terms.response.dto.js";

@ApiTags("auth")
@ApiHeader({
  name: "X-CSRF-Protection",
  required: false,
  description: "POST에는 값 1 및 WEB_ORIGIN과 일치하는 Origin 필수",
})
@Controller("api/v1/auth/signup")
export class SignupController {
  constructor(
    private readonly config: ConfigService,
    private readonly phone: PhoneVerificationService,
    private readonly terms: SignupTermsService,
  ) {}
  private requester(request: Request) {
    return cookie(
      request,
      signupCookieName(this.config.environment.nodeEnv === "production"),
    );
  }
  @Get("terms")
  @ApiResponse({ status: 200, type: SignupTermsDto })
  @Header("Cache-Control", "no-store")
  getTerms(): SignupTermsDto {
    return this.terms.get();
  }
  @Post("context")
  @ApiResponse({ status: 204, description: "HttpOnly 가입 요청자 쿠키 설정" })
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  context(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const existing = this.requester(request);
    response.cookie(
      signupCookieName(this.config.environment.nodeEnv === "production"),
      existing && /^[A-Za-z0-9_-]{43}$/.test(existing)
        ? existing
        : randomBytes(32).toString("base64url"),
      {
        httpOnly: true,
        secure: this.config.environment.nodeEnv === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 60_000,
      },
    );
  }
  @Post("phone-verifications")
  @ApiResponse({ status: 201, type: CreatedPhoneVerificationDto })
  @ApiResponse({
    status: 503,
    description: "휴대폰 인증 공급자 연결 실패 또는 미설정",
  })
  @Header("Cache-Control", "no-store")
  create(
    @Body() input: CreatePhoneVerificationDto,
    @Req() request: Request,
  ): Promise<CreatedPhoneVerificationDto> {
    return this.phone.create(
      input.phone,
      this.requester(request),
      request.ip ?? "unknown",
    );
  }
  @Post("phone-verifications/check")
  @ApiResponse({ status: 200, type: PhoneVerificationDto })
  @ApiResponse({
    status: 429,
    description: "10초 확인 간격 또는 요청당 12회 제한",
  })
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  check(
    @Body() input: CheckPhoneVerificationDto,
    @Req() request: Request,
  ): Promise<PhoneVerificationDto> {
    return this.phone.check(input.id, input.phone, this.requester(request));
  }
  @Post("phone-verifications/cancel")
  @ApiResponse({
    status: 204,
    description: "현재 요청자의 해당 인증 요청 취소",
  })
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  cancel(@Body() input: CancelPhoneVerificationDto, @Req() request: Request) {
    return this.phone.cancel(input.id, this.requester(request));
  }
}
