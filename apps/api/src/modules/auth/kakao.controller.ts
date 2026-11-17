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
import type { Request, Response } from "express";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { KakaoFlowService } from "./kakao-flow.service.js";
import {
  StartKakaoDto,
  StartKakaoLinkDto,
  KakaoSignupDto,
  CancelKakaoDto,
} from "./dto/request/kakao.request.dto.js";
import { AccessGuard } from "./guards/jwt-access.guard.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import type { AuthUser } from "./types/auth-user.js";
import {
  cookie,
  cookieNames,
  signupCookieName,
  kakaoCookieName,
} from "./utils/auth-cookies.js";
import { sendSessionCookies } from "./utils/session-cookies.js";
@Controller("api/v1/auth/kakao")
export class KakaoController {
  constructor(
    private readonly config: ConfigService,
    private readonly flow: KakaoFlowService,
  ) {}
  private get production() {
    return this.config.environment.nodeEnv === "production";
  }
  private browser(request: Request) {
    return cookie(request, kakaoCookieName(this.production));
  }
  private refresh(request: Request) {
    return cookie(request, cookieNames(this.production).refresh);
  }
  private setBrowser(response: Response, value: string) {
    response.cookie(kakaoCookieName(this.production), value, {
      httpOnly: true,
      secure: this.production,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60_000,
    });
  }
  @Post("start")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async start(
    @Body() input: StartKakaoDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.flow.start(
      this.browser(request),
      request.ip ?? "unknown",
      input.next,
      this.refresh(request),
    );
    this.setBrowser(response, result.browser);
    return { authorizationUrl: result.authorizationUrl };
  }
  @Post("link/start")
  @UseGuards(AccessGuard)
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async startLink(
    @Body() input: StartKakaoLinkDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.flow.start(
      this.browser(request),
      request.ip ?? "unknown",
      "/mypage",
      this.refresh(request),
      { user, ...input },
    );
    this.setBrowser(response, result.browser);
    return { authorizationUrl: result.authorizationUrl };
  }
  @Get("callback")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async callback(@Req() request: Request, @Res() response: Response) {
    const destination = new URL(
      "/auth/kakao/complete",
      this.config.environment.webOrigin,
    );
    try {
      const parameters = new URL(
        request.originalUrl,
        this.config.environment.webOrigin,
      ).searchParams;
      await this.flow.callback(this.browser(request), parameters);
    } catch (error) {
      if (!(error instanceof DomainHttpException)) throw error;
      destination.searchParams.set(
        "failure",
        error.code === "KAKAO_EXPIRED" ? "expired" : "invalid",
      );
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.redirect(303, destination.toString());
  }
  @Post("status")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  status(@Req() request: Request) {
    return this.flow.status(this.browser(request));
  }
  @Post("cancel")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  cancel(@Body() input: CancelKakaoDto, @Req() request: Request) {
    return this.flow.cancel(this.browser(request), input.id);
  }
  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return sendSessionCookies(
      response,
      await this.flow.login(
        this.browser(request),
        request.ip ?? "unknown",
        this.refresh(request),
      ),
      this.production,
    );
  }
  @Post("signup")
  @HttpCode(201)
  @Header("Cache-Control", "no-store")
  async signup(
    @Body() input: KakaoSignupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return sendSessionCookies(
      response,
      await this.flow.signup(
        this.browser(request),
        request.ip ?? "unknown",
        cookie(request, signupCookieName(this.production)),
        input,
        this.refresh(request),
      ),
      this.production,
    );
  }
  @Post("link/confirm")
  @UseGuards(AccessGuard)
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  link(@CurrentUser() user: AuthUser, @Req() request: Request) {
    return this.flow.link(this.browser(request), request.ip ?? "unknown", user);
  }
  @Get("connection")
  @UseGuards(AccessGuard)
  @Header("Cache-Control", "no-store")
  connection(@CurrentUser() user: AuthUser) {
    return this.flow.connection(user.id);
  }
}
