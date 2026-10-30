import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { ConfigService } from "../../config/config.service.js";
import { AuthRepository } from "./auth.repository.js";
import { Account, AuthSession } from "./auth.entity.js";
import { AuthError } from "./auth-error.js";
import { cookie, cookieNames } from "./auth-http.js";
import type { Request } from "express";

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  "jwt-access",
) {
  constructor(
    config: ConfigService,
    private readonly repository: AuthRepository,
  ) {
    const names = cookieNames(config.environment.nodeEnv === "production");
    super({
      jwtFromRequest: (request: Request) =>
        cookie(request, names.access) ?? null,
      secretOrKey: config.environment.authSecret,
      algorithms: ["HS256"],
      issuer: "chongmuya-api",
      audience: "chongmuya-web",
      ignoreExpiration: false,
    });
  }
  async validate(payload: unknown) {
    if (!payload || typeof payload !== "object")
      throw new AuthError("SESSION_INVALID");
    const { sub, sid, exp, iat } = payload as Record<string, unknown>;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      typeof sub !== "string" ||
      typeof sid !== "string" ||
      !uuid.test(sub) ||
      !uuid.test(sid) ||
      typeof exp !== "number" ||
      typeof iat !== "number"
    )
      throw new AuthError("SESSION_INVALID");
    return this.repository.run(async (db) => {
      const session = await db
        .getRepository(AuthSession)
        .findOneBy({ id: sid, accountId: sub });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      )
        throw new AuthError("SESSION_INVALID");
      const account = await db.getRepository(Account).findOneBy({ id: sub });
      if (!account) throw new AuthError("SESSION_INVALID");
      return { id: account.id, email: account.email };
    });
  }
}
