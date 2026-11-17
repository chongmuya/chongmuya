import { Injectable } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { Account } from "./entities/account.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { RefreshToken } from "./entities/refresh-token.entity.js";
import { AccountConsent } from "./entities/account-consent.entity.js";
import { ExternalIdentity } from "./entities/external-identity.entity.js";
import { KakaoAttempt } from "./entities/kakao-attempt.entity.js";
import { AuthAttemptsRepository } from "./repositories/auth-attempts.repository.js";
import { KakaoOidcService, KAKAO_ISSUER } from "./kakao-oidc.service.js";
import { SessionIssuerService } from "./session-issuer.service.js";
import { EmailVerificationService } from "./email-verification.service.js";
import { PhoneVerificationService } from "./phone-verification.service.js";
import { SignupTermsService } from "./signup-terms.service.js";
import { tokenHash } from "./utils/token-hash.js";
import { hashPassword, verifyPassword } from "./utils/password.js";
import { safeReturnPath } from "./utils/return-path.js";
import { sealVerifier, openVerifier } from "./utils/oauth-secret.js";
import type { AuthUser } from "./types/auth-user.js";
import type { KakaoSignupDto } from "./dto/request/kakao.request.dto.js";

export const KAKAO_POLICY = {
  lifetimeMs: 15 * 60_000,
  reauthMs: 5 * 60_000,
  startPerIp: 30,
  startPerBrowser: 10,
  finishPerIp: 50,
  reauthPerAccount: 10,
} as const;
const random = () => randomBytes(32).toString("base64url");
@Injectable()
export class KakaoFlowService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly oidc: KakaoOidcService,
    private readonly attempts: AuthAttemptsRepository,
    private readonly sessions: SessionIssuerService,
    private readonly email: EmailVerificationService,
    private readonly phone: PhoneVerificationService,
    private readonly terms: SignupTermsService,
  ) {}
  private browserHash(browser?: string) {
    if (!browser || !/^[A-Za-z0-9_-]{43}$/.test(browser))
      throw new DomainHttpException("KAKAO_INVALID");
    return tokenHash(`kakao-browser:${browser}`);
  }
  private async assertAnonymous(manager: EntityManager, refresh?: string) {
    if (!refresh) return;
    const token = await manager.findOneBy(RefreshToken, {
      hash: tokenHash(refresh),
    });
    const session =
      token && (await manager.findOneBy(AuthSession, { id: token.sessionId }));
    if (
      session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > Date.now()
    )
      throw new DomainHttpException("KAKAO_CONTEXT_CHANGED");
  }
  private async activeSession(
    manager: EntityManager,
    accountId: string,
    sessionId: string,
  ) {
    const session = await manager.findOne(AuthSession, {
      where: { id: sessionId, accountId },
      lock: { mode: "pessimistic_write" },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw new DomainHttpException("KAKAO_CONTEXT_CHANGED");
    return session;
  }
  async start(
    browser: string | undefined,
    ip: string,
    next: string | undefined,
    refresh?: string,
    link?: { user: AuthUser; password: string; consent: boolean },
  ) {
    this.oidc.assertConfigured();
    const db = await this.database.connect();
    await this.attempts.limit(
      db.manager,
      `kakao-start-ip:${ip}`,
      KAKAO_POLICY.startPerIp,
    );
    const binding =
      browser && /^[A-Za-z0-9_-]{43}$/.test(browser) ? browser : random();
    const browserHash = this.browserHash(binding);
    await this.attempts.limit(
      db.manager,
      `kakao-start-browser:${browserHash}`,
      KAKAO_POLICY.startPerBrowser,
    );
    let account: Account | null = null;
    if (link) {
      await this.attempts.limit(
        db.manager,
        `kakao-reauth:${link.user.id}`,
        KAKAO_POLICY.reauthPerAccount,
      );
      account = await db.manager.findOneBy(Account, { id: link.user.id });
      const valid = account?.passwordHash
        ? await verifyPassword(link.password, account.passwordHash)
        : (await hashPassword(link.password), false);
      if (!valid || !link.consent)
        throw new DomainHttpException("REAUTHENTICATION_REQUIRED");
    }
    const state = random(),
      nonce = random(),
      verifier = random();
    const authorizationUrl = await this.oidc.authorization(
      state,
      nonce,
      verifier,
    );
    await db.transaction(async (manager) => {
      if (link && account) {
        const current = await manager.findOne(Account, {
          where: { id: account.id },
          lock: { mode: "pessimistic_write" },
        });
        if (
          !current?.passwordHash ||
          current.passwordHash !== account.passwordHash
        )
          throw new DomainHttpException("REAUTHENTICATION_REQUIRED");
        await this.activeSession(manager, account.id, link.user.sessionId);
      } else await this.assertAnonymous(manager, refresh);
      const now = new Date();
      // One active attempt per browser. Reissuing atomically replaces every old proof.
      await manager.upsert(
        KakaoAttempt,
        {
          browserHash,
          id: randomUUID(),
          stateHash: tokenHash(state),
          verifier: sealVerifier(verifier, this.config.environment.authSecret),
          nonce,
          purpose: link ? "link" : "login",
          status: "requested",
          accountId: link?.user.id ?? null,
          sessionId: link?.user.sessionId ?? null,
          reauthenticatedAt: link ? now : null,
          consentAt: link ? now : null,
          issuer: null,
          sub: null,
          email: null,
          emailVerifiedAt: null,
          errorCode: null,
          next: link ? "/mypage" : safeReturnPath(next),
          createdAt: now,
          expiresAt: new Date(now.getTime() + KAKAO_POLICY.lifetimeMs),
        },
        ["browserHash"],
      );
    });
    return { browser: binding, authorizationUrl };
  }
  async callback(browser: string | undefined, parameters: URLSearchParams) {
    const hash = this.browserHash(browser),
      state = parameters.get("state");
    if (
      !state ||
      parameters.getAll("state").length !== 1 ||
      parameters.getAll("code").length > 1 ||
      parameters.getAll("error").length > 1
    )
      throw new DomainHttpException("KAKAO_INVALID");
    const db = await this.database.connect();
    const row = await db.transaction(async (manager) => {
      const attempt = await manager.findOne(KakaoAttempt, {
        where: { browserHash: hash },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !attempt ||
        attempt.stateHash !== tokenHash(state) ||
        attempt.status !== "requested"
      )
        throw new DomainHttpException("KAKAO_INVALID");
      if (attempt.expiresAt.getTime() <= Date.now())
        throw new DomainHttpException("KAKAO_EXPIRED");
      await manager.update(
        KakaoAttempt,
        { browserHash: hash },
        { status: "exchanging", verifier: "", nonce: "" },
      );
      return attempt;
    });
    try {
      if (parameters.has("error"))
        throw new DomainHttpException(
          parameters.get("error") === "access_denied"
            ? "KAKAO_CANCELLED"
            : parameters.get("error") === "invalid_scope"
              ? "KAKAO_CONFIGURATION"
              : "KAKAO_INVALID",
        );
      if (!parameters.get("code"))
        throw new DomainHttpException("KAKAO_INVALID");
      const identity = await this.oidc.exchange(
        parameters,
        state,
        row.nonce,
        openVerifier(row.verifier, this.config.environment.authSecret),
      );
      await db.manager.update(
        KakaoAttempt,
        { browserHash: hash, id: row.id, status: "exchanging" },
        { ...identity, status: "verified" },
      );
    } catch (error) {
      if (!(error instanceof DomainHttpException)) throw error;
      await db.manager.update(
        KakaoAttempt,
        { browserHash: hash, id: row.id, status: "exchanging" },
        { status: "failed", errorCode: error.code },
      );
    }
  }
  async cancel(browser?: string, id?: string) {
    if (!browser || !/^[A-Za-z0-9_-]{43}$/.test(browser)) return;
    const db = await this.database.connect();
    await db.manager.update(
      KakaoAttempt,
      { browserHash: this.browserHash(browser), ...(id ? { id } : {}) },
      { status: "cancelled", verifier: "", nonce: "" },
    );
  }
  private valid(row: KakaoAttempt | null): asserts row is KakaoAttempt {
    if (!row) throw new DomainHttpException("KAKAO_INVALID");
    if (row.expiresAt.getTime() <= Date.now())
      throw new DomainHttpException("KAKAO_EXPIRED");
    if (row.status === "failed")
      throw new DomainHttpException(
        row.errorCode === "KAKAO_CANCELLED"
          ? "KAKAO_CANCELLED"
          : row.errorCode === "KAKAO_UNAVAILABLE"
            ? "KAKAO_UNAVAILABLE"
            : row.errorCode === "KAKAO_CONFIGURATION"
              ? "KAKAO_CONFIGURATION"
              : "KAKAO_INVALID",
      );
    if (row.status !== "verified" || row.issuer !== KAKAO_ISSUER || !row.sub)
      throw new DomainHttpException("KAKAO_INVALID");
  }
  async status(browser?: string) {
    const db = await this.database.connect();
    const row = await db.manager.findOneBy(KakaoAttempt, {
      browserHash: this.browserHash(browser),
    });
    this.valid(row);
    const identity = await db.manager.findOneBy(ExternalIdentity, {
      issuer: row.issuer!,
      sub: row.sub!,
    });
    const duplicate =
      !identity &&
      row.email &&
      (await db.manager.existsBy(Account, { email: row.email }));
    return {
      id: row.id,
      kind:
        row.purpose === "link"
          ? "link"
          : identity
            ? "login"
            : duplicate
              ? "existing"
              : "signup",
      email: row.email,
      trustedEmail: !!row.emailVerifiedAt,
      next: row.next,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
  private async prepare(browser: string | undefined, ip: string) {
    const db = await this.database.connect();
    await this.attempts.limit(
      db.manager,
      `kakao-finish-ip:${ip}`,
      KAKAO_POLICY.finishPerIp,
    );
    const hint = await db.manager.findOneBy(KakaoAttempt, {
      browserHash: this.browserHash(browser),
    });
    this.valid(hint);
    return { db, hint };
  }
  private async identityLock(manager: EntityManager, sub: string) {
    // Serialize simultaneous first signup/link for the same verified issuer + subject.
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${KAKAO_ISSUER}:${sub}`],
    );
  }
  private async current(manager: EntityManager, hint: KakaoAttempt) {
    const row = await manager.findOne(KakaoAttempt, {
      where: { browserHash: hint.browserHash },
      lock: { mode: "pessimistic_write" },
    });
    this.valid(row);
    if (row.id !== hint.id) throw new DomainHttpException("KAKAO_INVALID");
    return row;
  }
  async login(browser: string | undefined, ip: string, refresh?: string) {
    const { db, hint } = await this.prepare(browser, ip);
    return db.transaction(async (manager) => {
      await this.identityLock(manager, hint.sub!);
      const identity = await manager.findOneBy(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        sub: hint.sub!,
      });
      if (!identity) throw new DomainHttpException("KAKAO_INVALID");
      const account = await manager.findOneOrFail(Account, {
        where: { id: identity.accountId },
        lock: { mode: "pessimistic_write" },
      });
      const row = await this.current(manager, hint);
      if (row.purpose !== "login")
        throw new DomainHttpException("KAKAO_INVALID");
      await this.assertAnonymous(manager, refresh);
      if (
        account.credentialsChangedAt &&
        row.createdAt <= account.credentialsChangedAt
      )
        throw new DomainHttpException("KAKAO_CONTEXT_CHANGED");
      row.status = "consumed";
      await manager.save(row);
      return this.sessions.createSession(manager, account);
    });
  }
  async signup(
    browser: string | undefined,
    ip: string,
    requester: string | undefined,
    input: KakaoSignupDto,
    refresh?: string,
  ) {
    this.terms.validate(input.consents);
    const { db, hint } = await this.prepare(browser, ip);
    return db.transaction(async (manager) => {
      await this.identityLock(manager, hint.sub!);
      const row = await this.current(manager, hint);
      if (row.purpose !== "login")
        throw new DomainHttpException("KAKAO_INVALID");
      await this.assertAnonymous(manager, refresh);
      if (
        await manager.existsBy(ExternalIdentity, {
          issuer: KAKAO_ISSUER,
          sub: row.sub!,
        })
      )
        throw new DomainHttpException("KAKAO_ALREADY_LINKED");
      // Even unverified provider email matches require explicit existing-account ownership.
      if (
        (row.email &&
          (await manager.existsBy(Account, { email: row.email }))) ||
        (await manager.existsBy(Account, { email: input.email }))
      )
        throw new DomainHttpException("KAKAO_LINK_REQUIRED");
      const trusted = input.email === row.email && row.emailVerifiedAt;
      if (!trusted && !input.emailVerificationId)
        throw new DomainHttpException("EMAIL_VERIFICATION_REQUIRED");
      const emailVerifiedAt =
        trusted ||
        (await this.email.consume(
          manager,
          requester,
          input.emailVerificationId!,
          input.email,
        ));
      const phoneVerifiedAt = await this.phone.consume(
        manager,
        requester,
        input.phoneVerificationId,
        input.phone,
      );
      const account = manager.create(Account, {
        id: randomUUID(),
        email: input.email,
        passwordHash: null,
        accountType: null,
        name: input.name,
        nickname: null,
        phone: input.phone,
        phoneVerifiedAt,
        emailVerifiedAt,
        emailVerificationSource: trusted ? "kakao" : "resend",
        createdAt: new Date(),
      });
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(Account)
        .values(account)
        .orIgnore()
        .returning("id")
        .execute();
      if (!inserted.raw.length)
        throw new DomainHttpException("KAKAO_LINK_REQUIRED");
      await manager.insert(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        sub: row.sub!,
        accountId: account.id,
        createdAt: account.createdAt,
      });
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
      row.status = "consumed";
      await manager.save(row);
      return this.sessions.createSession(manager, account);
    });
  }
  async link(browser: string | undefined, ip: string, user: AuthUser) {
    const { db, hint } = await this.prepare(browser, ip);
    return db.transaction(async (manager) => {
      await this.identityLock(manager, hint.sub!);
      await manager.findOneOrFail(Account, {
        where: { id: user.id },
        lock: { mode: "pessimistic_write" },
      });
      await this.activeSession(manager, user.id, user.sessionId);
      const row = await this.current(manager, hint);
      if (
        row.purpose !== "link" ||
        row.accountId !== user.id ||
        row.sessionId !== user.sessionId ||
        !row.consentAt ||
        !row.reauthenticatedAt ||
        Date.now() - row.reauthenticatedAt.getTime() > KAKAO_POLICY.reauthMs
      )
        throw new DomainHttpException("REAUTHENTICATION_REQUIRED");
      const identity = await manager.findOneBy(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        sub: row.sub!,
      });
      const own = await manager.findOneBy(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        accountId: user.id,
      });
      if (
        (identity && identity.accountId !== user.id) ||
        (own && own.sub !== row.sub)
      )
        throw new DomainHttpException("KAKAO_ALREADY_LINKED");
      if (!identity)
        await manager.insert(ExternalIdentity, {
          issuer: KAKAO_ISSUER,
          sub: row.sub!,
          accountId: user.id,
          createdAt: new Date(),
        });
      row.status = "consumed";
      await manager.save(row);
      return { linked: true };
    });
  }
  async connection(accountId: string) {
    const db = await this.database.connect();
    const account = await db.manager.findOneByOrFail(Account, {
      id: accountId,
    });
    return {
      linked: await db.manager.existsBy(ExternalIdentity, {
        issuer: KAKAO_ISSUER,
        accountId,
      }),
      canLink: !!account.passwordHash,
    };
  }
}
