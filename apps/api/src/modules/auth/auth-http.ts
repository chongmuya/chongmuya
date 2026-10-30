import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "../../config/config.service.js";

import type { AccountDto } from "./auth.dto.js";

export type AuthRequest = Request & { user: AccountDto | false };
export function cookie(request: Request, name: string): string | undefined {
  const matches = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}
export function cookieNames(production: boolean) {
  return {
    access: production ? "__Host-access" : "access",
    refresh: production ? "__Host-refresh" : "refresh",
  };
}
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    if (
      request.headers.origin !== this.config.environment.webOrigin ||
      request.headers["x-csrf-protection"] !== "1" ||
      request.headers["sec-fetch-site"] === "cross-site"
    )
      throw new ForbiddenException();
    return true;
  }
}
