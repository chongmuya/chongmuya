import { UnauthorizedException } from "@nestjs/common";

export class AuthError extends UnauthorizedException {
  constructor(
    readonly code: "ACCESS_EXPIRED" | "SESSION_INVALID" | "INVALID_CREDENTIALS",
  ) {
    super({ code });
  }
}
