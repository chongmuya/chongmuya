import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ConfigService } from "../../config/config.service.js";
import { AuthService, ACCESS_SECONDS } from "./auth.service.js";
import { AccountDto, CredentialsDto, SessionDto } from "./auth.dto.js";
import { cookie, cookieNames } from "./auth-http.js";
import type { AuthRequest } from "./auth-http.js";
import { AccessGuard, OptionalAccessGuard } from "./jwt-access.guard.js";
import { AuthError } from "./auth-error.js";

@ApiTags("auth")
@ApiHeader({
  name: "X-CSRF-Protection",
  required: false,
  description: "POST에는 값 1 및 WEB_ORIGIN과 일치하는 Origin 필수",
})
@ApiForbiddenResponse({ description: "Origin 또는 CSRF 헤더 검증 실패" })
@ApiUnauthorizedResponse({
  description: "ACCESS_EXPIRED / SESSION_INVALID / INVALID_CREDENTIALS",
})
@ApiResponse({
  status: 503,
  description: "일시적인 DB 장애. 세션 무효화가 아님",
})
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private get production() {
    return this.config.environment.nodeEnv === "production";
  }
  private get names() {
    return cookieNames(this.production);
  }
  private options() {
    return {
      httpOnly: true,
      secure: this.production,
      sameSite: "lax" as const,
      path: "/",
    };
  }
  private clear(response: Response) {
    response.clearCookie(this.names.access, this.options());
    response.clearCookie(this.names.refresh, this.options());
  }
  private send(
    response: Response,
    result: Awaited<ReturnType<AuthService["refresh"]>>,
  ) {
    response.cookie(this.names.access, result.access, {
      ...this.options(),
      maxAge: ACCESS_SECONDS * 1000,
    });
    if (result.refresh)
      response.cookie(this.names.refresh, result.refresh, {
        ...this.options(),
        expires: result.expiresAt,
      });
    return { authenticated: true, account: result.account };
  }
  @Post("signup")
  @HttpCode(201)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "이메일 회원가입 및 세션 생성 (모임 온보딩과 독립)",
  })
  @ApiResponse({ status: 201, type: SessionDto })
  @ApiResponse({ status: 409, description: "이미 등록된 이메일" })
  @ApiResponse({
    status: 429,
    description: "15분 동안 이메일 10회/IP 50회 제한",
  })
  async signup(
    @Body() body: CredentialsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      response,
      await this.auth.credentials(body, request.ip ?? "unknown", true),
    );
  }
  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: SessionDto })
  @ApiResponse({ status: 429, description: "로그인 시도 제한" })
  async login(
    @Body() body: CredentialsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.send(
      response,
      await this.auth.credentials(body, request.ip ?? "unknown", false),
    );
  }
  @Get("me")
  @UseGuards(AccessGuard)
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @ApiOkResponse({ type: AccountDto })
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Post("refresh")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: SessionDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return this.send(
        response,
        await this.auth.refresh(cookie(request, this.names.refresh)),
      );
    } catch (error) {
      if (error instanceof AuthError) this.clear(response);
      throw error;
    }
  }
  @Post("session/restore")
  @UseGuards(OptionalAccessGuard)
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "최초 세션 복원. 쿠키 없음/무효 세션은 authenticated:false",
  })
  @ApiOkResponse({ type: SessionDto })
  async restore(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    // A valid access cookie avoids unnecessary rotation on reload and across tabs.
    if (request.user) return { authenticated: true, account: request.user };
    const raw = cookie(request, this.names.refresh);
    if (!raw) {
      this.clear(response);
      return { authenticated: false, account: null };
    }
    try {
      return this.send(response, await this.auth.refresh(raw));
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      this.clear(response);
      return { authenticated: false, account: null };
    }
  }
  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiResponse({
    status: 204,
    description: "현재 세션 폐기 및 쿠키 삭제. 반복 호출 가능",
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(cookie(request, this.names.refresh));
    this.clear(response);
  }
}
