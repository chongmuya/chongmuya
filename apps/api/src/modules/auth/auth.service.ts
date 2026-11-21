import type { EntityManager } from "typeorm";
import { SessionIssuerService } from "./session-issuer.service.js";
import { EmailVerificationService } from "./email-verification.service.js";
import type { FirstSetupDto } from "./dto/request/first-setup.request.dto.js";
import { Injectable } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { Account } from "./entities/account.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { RefreshToken } from "./entities/refresh-token.entity.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { tokenHash } from "./utils/token-hash.js";
import { AuthError } from "./exceptions/auth.exception.js";
import { hashPassword, verifyPassword } from "./utils/password.js";
import type { CredentialsDto } from "./dto/request/credentials.request.dto.js";

import { publicAccount } from "./utils/public-account.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { AccountConsent } from "./entities/account-consent.entity.js";
import { PhoneVerificationService } from "./phone-verification.service.js";
import { SignupTermsService } from "./signup-terms.service.js";
import type { SignupDto } from "./dto/request/signup.request.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionIssuerService,
    private readonly emailVerification: EmailVerificationService,
    private readonly phone: PhoneVerificationService,
    private readonly terms: SignupTermsService,
  ) {}
  async groupAccount(m: EntityManager, id: string) {
    const a = await m.findOneBy(Account, { id });
    if (
      !a ||
      a.accountType !== "organizer" ||
      !a.emailVerifiedAt ||
      !a.phoneVerifiedAt ||
      !a.name ||
      !a.phone
    )
      throw new DomainHttpException("GROUP_TARGET_UNAVAILABLE");
    return { id: a.id, name: a.name, email: a.email, phone: a.phone };
  }
  async canUseOrganizerWorkspace(id: string, manager: EntityManager) {
    const account = await manager.findOneBy(Account, {
      id,
      accountType: "organizer",
    });
    return !!account?.nickname?.trim();
  }
  async assertOwnerAccount(id: string, manager: EntityManager) {
    if (!(await manager.existsBy(Account, { id, accountType: "owner" })))
      throw new DomainHttpException("OWNER_REQUIRED");
  }
  private async limit(ip: string, email: string) {
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `ip:${ip}`, 50);
    await consumeRequestLimit(db.manager, `email:${email}`, 10);
    return db;
  }
  async login(input: CredentialsDto, ip: string) {
    const db = await this.limit(ip, input.email);
    const account = await db
      .getRepository(Account)
      .findOneBy({ email: input.email });
    const valid = account?.passwordHash
      ? await verifyPassword(input.password, account.passwordHash)
      : (await hashPassword(input.password), false);
    if (!valid || !account) throw new AuthError("INVALID_CREDENTIALS");
    return db.transaction(async (manager) => {
      const current = await manager.findOne(Account, {
        where: { id: account.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!current || current.passwordHash !== account.passwordHash)
        throw new AuthError("INVALID_CREDENTIALS");
      return this.sessions.createSession(manager, current);
    });
  }
  async signup(input: SignupDto, ip: string, requester?: string) {
    this.terms.validate(input.consents);
    const db = await this.limit(ip, input.email);
    const passwordHash = await hashPassword(input.password);
    return db.transaction(async (manager) => {
      const emailVerifiedAt = await this.emailVerification.consume(
        manager,
        requester,
        input.emailVerificationId,
        input.email,
      );
      const phoneVerifiedAt = await this.phone.consume(
        manager,
        requester,
        input.phoneVerificationId,
        input.phone,
      );
      const account = Object.assign(new Account(), {
        id: randomUUID(),
        email: input.email,
        accountType: "organizer" as const,
        passwordHash,
        createdAt: new Date(),
        name: input.name,
        nickname: null,
        phone: input.phone,
        phoneVerifiedAt,
        emailVerifiedAt,
        emailVerificationSource: "resend",
      });
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(Account)
        .values(account)
        .orIgnore()
        .returning("id")
        .execute();
      if (!result.raw.length)
        throw new DomainHttpException("EMAIL_ALREADY_REGISTERED");
      await manager.insert(
        AccountConsent,
        input.consents.map((consent) => ({
          accountId: account.id,
          termId: consent.id,
          version: consent.version,
          accepted: consent.accepted,
          recordedAt: account.createdAt,
        })),
      );
      return this.sessions.createSession(manager, account);
    });
  }
  async saveFirstSetup(accountId: string, input: FirstSetupDto) {
    const db = await this.database.connect();
    return db.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id: accountId },
        lock: { mode: "pessimistic_write" },
      });
      if (!account) throw new AuthError("SESSION_INVALID");
      if (account.accountType === null && input.accountType === "owner")
        throw new DomainHttpException("PILOT_ORGANIZER_SIGNUP_ONLY");
      if (
        input.accountType &&
        account.accountType &&
        account.accountType !== input.accountType
      )
        throw new DomainHttpException("FIRST_SETUP_CONFLICT");
      const type = account.accountType ?? input.accountType;
      if (!type || (input.nickname !== undefined && type !== "organizer"))
        throw new DomainHttpException("VALIDATION_FAILED");
      if (
        input.nickname !== undefined &&
        account.nickname &&
        account.nickname !== input.nickname
      )
        throw new DomainHttpException("FIRST_SETUP_CONFLICT");
      account.accountType = type;
      if (input.nickname !== undefined) account.nickname = input.nickname;
      await manager.save(account);
      return publicAccount(account);
    });
  }
  async refresh(raw?: string) {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new AuthError("SESSION_INVALID");
    const next = randomBytes(32).toString("base64url");
    // Lock the session family, not only one token: rotation and logout serialize.
    const db = await this.database.connect();
    const result = await db.transaction(async (manager) => {
      const token = await manager.findOneBy(RefreshToken, {
        hash: tokenHash(raw),
      });
      if (!token) return null;
      const hint = await manager.findOneBy(AuthSession, {
        id: token.sessionId,
      });
      if (!hint) return null;
      await manager.findOneOrFail(Account, {
        where: { id: hint.accountId },
        lock: { mode: "pessimistic_write" },
      });
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
    });
    if (!result) throw new AuthError("SESSION_INVALID");
    return this.sessions.issue(result.session, result.account, next);
  }
  async logout(raw?: string) {
    if (!raw) return;
    const db = await this.database.connect();
    await db.transaction(async (manager) => {
      const token = await manager.findOneBy(RefreshToken, {
        hash: tokenHash(raw),
      });
      if (!token) return;
      const hint = await manager.findOneBy(AuthSession, {
        id: token.sessionId,
      });
      if (!hint) return null;
      await manager.findOneOrFail(Account, {
        where: { id: hint.accountId },
        lock: { mode: "pessimistic_write" },
      });
      const session = await manager.findOne(AuthSession, {
        where: { id: token.sessionId },
        lock: { mode: "pessimistic_write" },
      });
      if (session) {
        session.revokedAt = new Date();
        await manager.save(session);
      }
    });
  }
}
