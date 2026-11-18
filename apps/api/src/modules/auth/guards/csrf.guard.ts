import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "../../../config/config.service.js";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // This exact machine-to-machine route verifies the raw-body SOLAPI signature.
    if (request.method === "POST" && request.path === "/api/v1/webhooks/solapi")
      return true;
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
