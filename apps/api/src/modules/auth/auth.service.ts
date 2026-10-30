import { ConflictException, Injectable } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "../../config/config.service.js";
import { Account, AuthSession, RefreshToken } from "./auth.entity.js";
import { AuthRepository, tokenHash } from "./auth.repository.js";
import { AuthError } from "./auth-error.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { CredentialsDto } from "./auth.dto.js";

export const ACCESS_SECONDS = 300;
export const SESSION_SECONDS = 60 * 60 * 24 * 14;
const publicAccount = (account: Account) => ({
  id: account.id,
  email: account.email,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}
  async credentials(input: CredentialsDto, ip: string, signup: boolean) {
    await this.repository.limit(`ip:${ip}`, 50);
    await this.repository.limit(`email:${input.email}`, 10);
    let account = await this.repository.run((db) =>
      db.getRepository(Account).findOneBy({ email: input.email }),
    );
    if (signup) {
      const passwordHash = await hashPassword(input.password);
      if (account) throw new ConflictException();
      account = await this.repository.run(async (db) => {
        const value = db.getRepository(Account).create({
          id: randomUUID(),
          email: input.email,
          passwordHash,
          createdAt: new Date(),
        });
        const result = await db
          .createQueryBuilder()
          .insert()
          .into(Account)
          .values(value)
          .orIgnore()
          .returning("id")
          .execute();
        if (!result.raw.length) throw new ConflictException();
        return value;
      });
    } else {
      // Equal-cost work for unknown accounts avoids a fast account-existence oracle.
      const valid = account
        ? await verifyPassword(input.password, account.passwordHash)
        : (await hashPassword(input.password), false);
      if (!valid || !account) throw new AuthError("INVALID_CREDENTIALS");
    }
    const session = new AuthSession();
    Object.assign(session, {
      id: randomUUID(),
      accountId: account.id,
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
      revokedAt: null,
    });
    const refresh = randomBytes(32).toString("base64url");
    await this.repository.run((db) =>
      db.transaction(async (manager) => {
        await manager.save(session);
        await manager.insert(RefreshToken, {
          hash: tokenHash(refresh),
          sessionId: session.id,
          usedAt: null,
        });
      }),
    );
    return this.issue(session, account, refresh);
  }
  private async issue(
    session: AuthSession,
    account: Account,
    refresh?: string,
  ) {
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
  async refresh(raw?: string) {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new AuthError("SESSION_INVALID");
    const next = randomBytes(32).toString("base64url");
    // Lock the session family, not only one token: rotation and logout serialize.
    const result = await this.repository.run((db) =>
      db.transaction(async (manager) => {
        const token = await manager.findOneBy(RefreshToken, {
          hash: tokenHash(raw),
        });
        if (!token) return null;
        const session = await manager.findOne(AuthSession, {
          where: { id: token.sessionId },
          lock: { mode: "pessimistic_write" },
        });
        if (
          !session ||
          session.revokedAt ||
          session.expiresAt.getTime() <= Date.now()
        )
          return null;
        const current = await manager.findOneByOrFail(RefreshToken, {
          hash: token.hash,
        });
        if (current.usedAt) {
          session.revokedAt = new Date();
          await manager.save(session);
          return null; // Commit revocation before returning an authentication error.
        }
        current.usedAt = new Date();
        await manager.save(current);
        await manager.insert(RefreshToken, {
          hash: tokenHash(next),
          sessionId: session.id,
          usedAt: null,
        });
        const account = await manager.findOneByOrFail(Account, {
          id: session.accountId,
        });
        return { session, account };
      }),
    );
    if (!result) throw new AuthError("SESSION_INVALID");
    return this.issue(result.session, result.account, next);
  }
  async logout(raw?: string) {
    if (!raw) return;
    await this.repository.run((db) =>
      db.transaction(async (manager) => {
        const token = await manager.findOneBy(RefreshToken, {
          hash: tokenHash(raw),
        });
        if (!token) return;
        const session = await manager.findOne(AuthSession, {
          where: { id: token.sessionId },
          lock: { mode: "pessimistic_write" },
        });
        if (session) {
          session.revokedAt = new Date();
          await manager.save(session);
        }
      }),
    );
  }
}
