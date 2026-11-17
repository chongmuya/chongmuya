import { safeReturnPath } from "./utils/return-path.js";
import { HttpException, Injectable } from "@nestjs/common";
import { randomBytes, randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { IsNull } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { Account } from "./entities/account.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { PasswordReset } from "./entities/password-reset.entity.js";
import { KakaoAttempt } from "./entities/kakao-attempt.entity.js";
import { AuthAttemptsRepository } from "./repositories/auth-attempts.repository.js";
import { ResendMailService } from "./resend-mail.service.js";
import { tokenHash } from "./utils/token-hash.js";
import { hashPassword } from "./utils/password.js";

export const RESET_POLICY = {
  lifetimeMs: 15 * 60_000,
  resendMs: 60_000,
  issuePerEmail: 5,
  issuePerIp: 30,
  checkPerIp: 60,
  savePerIp: 20,
  perToken: 10,
  minimumResponseMs: 400,
} as const;
const accepted = { accepted: true } as const;
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly attempts: AuthAttemptsRepository,
    private readonly mail: ResendMailService,
  ) {}
  private digest(token: string) {
    return tokenHash(`password-reset:${token}`);
  }
  private invalid() {
    return new DomainHttpException("PASSWORD_RESET_INVALID");
  }
  async request(email: string, ip: string, next?: string) {
    const started = performance.now();
    try {
      const db = await this.database.connect();
      await this.attempts.limit(
        db.manager,
        `reset-issue-ip:${ip}`,
        RESET_POLICY.issuePerIp,
      );
      try {
        await this.attempts.limit(
          db.manager,
          `reset-issue-email:${email}`,
          RESET_POLICY.issuePerEmail,
        );
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 429)
          return accepted;
        throw error;
      }
      const token = randomBytes(32).toString("base64url");
      const record = await db.transaction(async (manager) => {
        const account = await manager.findOne(Account, {
          where: { email },
          lock: { mode: "pessimistic_write" },
        });
        if (!account?.passwordHash) return null;
        const latest = await manager.findOne(PasswordReset, {
          where: { accountId: account.id },
          order: { createdAt: "DESC" },
        });
        if (
          latest &&
          Date.now() - latest.createdAt.getTime() < RESET_POLICY.resendMs
        )
          return null;
        const now = new Date();
        await manager.update(
          PasswordReset,
          { accountId: account.id, usedAt: IsNull(), invalidatedAt: IsNull() },
          { invalidatedAt: now },
        );
        const row = manager.create(PasswordReset, {
          hash: this.digest(token),
          accountId: account.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() + RESET_POLICY.lifetimeMs),
          usedAt: null,
          invalidatedAt: null,
          delivery: "sending",
        });
        await manager.insert(PasswordReset, row);
        return row;
      });
      // Provider latency never controls this public response. No transaction/lock spans delivery.
      // Best effort in-process delivery: a process exit may lose an unsent email, never grant access.
      if (record)
        void this.deliver(
          email,
          token,
          record.hash,
          safeReturnPath(next),
        ).catch(() => undefined);
      return accepted;
    } finally {
      await delay(
        Math.max(
          0,
          RESET_POLICY.minimumResponseMs +
            randomInt(100) -
            (performance.now() - started),
        ),
      );
    }
  }
  private async deliver(
    email: string,
    token: string,
    hash: string,
    next: string,
  ) {
    const url = new URL(
      "/auth/reset-password",
      this.config.environment.webOrigin,
    );
    // Fragments never reach HTTP request/access logs or Referer headers.
    url.searchParams.set("next", next);
    url.hash = new URLSearchParams({ token }).toString();
    let delivery: "sent" | "failed" = "sent";
    try {
      await this.mail.send(
        email,
        "총무야 비밀번호 재설정",
        `15분 안에 아래 링크에서 비밀번호를 변경해 주세요. 요청하지 않았다면 무시해 주세요.\n${url}`,
        `password-reset:${hash}`,
      );
    } catch {
      delivery = "failed";
    }
    const db = await this.database.connect();
    await db.manager.update(PasswordReset, { hash }, { delivery });
  }
  async check(token: string, ip: string) {
    const db = await this.database.connect();
    await this.attempts.limit(
      db.manager,
      `reset-check-ip:${ip}`,
      RESET_POLICY.checkPerIp,
    );
    await this.attempts.limit(
      db.manager,
      `reset-check:${this.digest(token)}`,
      RESET_POLICY.perToken,
    );
    const record = await db.manager.findOneBy(PasswordReset, {
      hash: this.digest(token),
    });
    if (
      !record ||
      record.usedAt ||
      record.invalidatedAt ||
      record.delivery !== "sent" ||
      record.expiresAt.getTime() <= Date.now()
    )
      throw this.invalid();
    return { valid: true, expiresAt: record.expiresAt.toISOString() };
  }
  async reset(token: string, password: string, ip: string) {
    const db = await this.database.connect();
    const hash = this.digest(token);
    await this.attempts.limit(
      db.manager,
      `reset-save-ip:${ip}`,
      RESET_POLICY.savePerIp,
    );
    await this.attempts.limit(
      db.manager,
      `reset-save:${hash}`,
      RESET_POLICY.perToken,
    );
    const hint = await db.manager.findOneBy(PasswordReset, { hash });
    if (!hint) throw this.invalid();
    const passwordHash = await hashPassword(password);
    const email = await db.transaction(async (manager) => {
      // Account is the shared first lock. Reset then locks its own token before
      // revoking sessions; login/refresh/link cannot pass the account lock meanwhile.
      const account = await manager.findOne(Account, {
        where: { id: hint.accountId },
        lock: { mode: "pessimistic_write" },
      });
      const record = await manager.findOne(PasswordReset, {
        where: { hash },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !account?.passwordHash ||
        !record ||
        record.usedAt ||
        record.invalidatedAt ||
        record.delivery !== "sent" ||
        record.expiresAt.getTime() <= Date.now()
      )
        throw this.invalid();
      const now = new Date();
      account.passwordHash = passwordHash;
      account.credentialsChangedAt = now;
      await manager.save(account);
      await manager.update(
        AuthSession,
        { accountId: account.id, revokedAt: IsNull() },
        { revokedAt: now },
      );
      await manager.update(PasswordReset, { hash }, { usedAt: now });
      await manager.update(
        PasswordReset,
        { accountId: account.id, usedAt: IsNull(), invalidatedAt: IsNull() },
        { invalidatedAt: now },
      );
      await manager.update(
        KakaoAttempt,
        { accountId: account.id },
        { status: "cancelled", verifier: "", nonce: "" },
      );
      return account.email;
    });
    // Notification cannot turn a committed credential change into an apparent failure.
    void this.mail
      .send(
        email,
        "총무야 비밀번호 변경 안내",
        "비밀번호가 변경되어 기존 로그인 세션이 모두 종료되었습니다. 직접 변경하지 않았다면 support@chongmuya.com으로 문의해 주세요.",
        `password-reset-notice:${hash}`,
      )
      .catch(() => undefined);
  }
}
