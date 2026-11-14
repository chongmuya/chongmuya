import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { ConfigService } from "../../../config/config.service.js";
import { cookie, cookieNames } from "../utils/auth-cookies.js";
import { AuthError } from "../exceptions/auth.exception.js";

@Injectable()
export class AccessGuard extends AuthGuard("jwt-access") {
  constructor(private readonly config: ConfigService) {
    super();
  }
  handleRequest<TUser>(
    error: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (error) throw error;
    if (user) return user;
    const request = context.switchToHttp().getRequest<Request>();
    const names = cookieNames(this.config.environment.nodeEnv === "production");
    const expired = info instanceof Error && info.name === "TokenExpiredError";
    const missingAccess =
      !cookie(request, names.access) && Boolean(cookie(request, names.refresh));
    throw new AuthError(
      expired || missingAccess ? "ACCESS_EXPIRED" : "SESSION_INVALID",
    );
  }
}
