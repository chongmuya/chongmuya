import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
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
    const request = context.switchToHttp().getRequest<Request>();
    if (user) {
      const expectedAccount = request.get("X-Expected-Account");
      const accountId =
        typeof user === "object" && "id" in user ? user.id : undefined;
      if (expectedAccount !== undefined && expectedAccount !== accountId)
        throw new DomainHttpException("SESSION_CHANGED");
      return user;
    }
    const names = cookieNames(this.config.environment.nodeEnv === "production");
    const expired = info instanceof Error && info.name === "TokenExpiredError";
    const missingAccess =
      !cookie(request, names.access) && Boolean(cookie(request, names.refresh));
    throw new AuthError(
      expired || missingAccess ? "ACCESS_EXPIRED" : "SESSION_INVALID",
    );
  }
}
