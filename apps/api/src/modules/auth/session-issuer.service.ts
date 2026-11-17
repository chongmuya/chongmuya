import { Injectable } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "../../config/config.service.js";
import { Account } from "./entities/account.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { RefreshToken } from "./entities/refresh-token.entity.js";
import { tokenHash } from "./utils/token-hash.js";
import { publicAccount } from "./utils/public-account.js";
export const ACCESS_SECONDS = 300;
export const SESSION_SECONDS = 60 * 60 * 24 * 14;
@Injectable()
export class SessionIssuerService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}
  async createSession(manager: EntityManager, account: Account) {
    const session = Object.assign(new AuthSession(), {
      id: randomUUID(),
      accountId: account.id,
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
      revokedAt: null,
    });
    const refresh = randomBytes(32).toString("base64url");
    await manager.save(session);
    await manager.insert(RefreshToken, {
      hash: tokenHash(refresh),
      sessionId: session.id,
      usedAt: null,
    });
    // A signing failure rolls back account, consents and verification consumption too.
    return this.issue(session, account, refresh);
  }
  async issue(session: AuthSession, account: Account, refresh?: string) {
    const access = await this.jwt.signAsync(
      { sub: account.id, sid: session.id },
      {
        secret: this.config.environment.authSecret,
        algorithm: "HS256",
        issuer: "chongmuya-api",
        audience: "chongmuya-web",
        expiresIn: ACCESS_SECONDS,
      },
    );
    return {
      access,
      refresh,
      expiresAt: session.expiresAt,
      account: publicAccount(account),
    };
  }
}
