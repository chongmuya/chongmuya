import { Injectable } from "@nestjs/common";
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { EmailVerification } from "./entities/email-verification.entity.js";
import { Account } from "./entities/account.entity.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { tokenHash } from "./utils/token-hash.js";
import { ResendMailService } from "./resend-mail.service.js";
export const EMAIL_LIMITS = {
  lifetime: 600_000,
  resend: 60_000,
  failures: 5,
  issueIdentity: 5,
  issueIp: 30,
  checkIdentity: 20,
  checkIp: 100,
} as const;
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly mail: ResendMailService,
  ) {}
  private owner(requester?: string) {
    if (!requester || !/^[A-Za-z0-9_-]{43}$/.test(requester))
      throw new DomainHttpException("EMAIL_VERIFICATION_INVALID");
    return tokenHash(requester);
  }
  private digest(
    row: Pick<EmailVerification, "requesterHash" | "email" | "id">,
    code: string,
  ) {
    const secret = this.config.environment.emailVerificationSecret;
    if (!secret)
      throw new DomainHttpException("EMAIL_VERIFICATION_UNAVAILABLE");
    return createHmac("sha256", secret)
      .update(
        JSON.stringify(["signup", row.requesterHash, row.id, row.email, code]),
      )
      .digest("hex");
  }
  private view(row: EmailVerification) {
    return {
      id: row.id,
      email: row.email,
      status:
        row.expiresAt.getTime() <= Date.now()
          ? ("expired" as const)
          : row.delivery !== "sent"
            ? ("failed" as const)
            : row.verifiedAt
              ? ("verified" as const)
              : ("pending" as const),
      expiresAt: row.expiresAt.toISOString(),
      retryAt: row.retryAt.toISOString(),
      serverNow: new Date().toISOString(),
      attemptsRemaining: EMAIL_LIMITS.failures - row.failures,
    };
  }
  private async current(
    manager: EntityManager,
    requester: string | undefined,
    id: string,
    email: string,
  ) {
    const row = await manager.findOne(EmailVerification, {
      where: { requesterHash: this.owner(requester) },
      lock: { mode: "pessimistic_write" },
    });
    if (
      !row ||
      row.id !== id ||
      row.email !== email ||
      row.purpose !== "signup" ||
      row.cancelledAt ||
      row.consumedAt
    )
      throw new DomainHttpException("EMAIL_VERIFICATION_INVALID");
    if (row.expiresAt.getTime() <= Date.now())
      throw new DomainHttpException("EMAIL_VERIFICATION_EXPIRED");
    if (row.delivery !== "sent")
      throw new DomainHttpException("EMAIL_VERIFICATION_UNAVAILABLE");
    return row;
  }
  async create(email: string, requester: string | undefined, ip: string) {
    this.mail.assertConfigured();
    const requesterHash = this.owner(requester),
      db = await this.database.connect();
    await consumeRequestLimit(
      db.manager,
      `email-issue-ip:${ip}`,
      EMAIL_LIMITS.issueIp,
    );
    await consumeRequestLimit(
      db.manager,
      `email-issue-owner:${requesterHash}`,
      EMAIL_LIMITS.issueIdentity,
    );
    await consumeRequestLimit(
      db.manager,
      `email-issue-address:${email}`,
      EMAIL_LIMITS.issueIdentity,
    );
    if (await db.getRepository(Account).existsBy({ email }))
      throw new DomainHttpException("EMAIL_ALREADY_REGISTERED");
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0"),
      now = new Date();
    const next = Object.assign(new EmailVerification(), {
      requesterHash,
      id: randomUUID(),
      email,
      purpose: "signup",
      delivery: "sending",
      createdAt: now,
      expiresAt: new Date(now.getTime() + EMAIL_LIMITS.lifetime),
      retryAt: new Date(now.getTime() + EMAIL_LIMITS.resend),
      failures: 0,
      verifiedAt: null,
      consumedAt: null,
      cancelledAt: null,
    });
    next.codeHash = this.digest(next, code);
    await db.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(EmailVerification)
        .values(next)
        .orIgnore()
        .execute();
      const previous = await manager.findOneOrFail(EmailVerification, {
        where: { requesterHash },
        lock: { mode: "pessimistic_write" },
      });
      if (previous.id !== next.id && previous.retryAt.getTime() > Date.now())
        throw new DomainHttpException("EMAIL_VERIFICATION_WAIT");
      await manager.save(next);
    });
    let delivery: "sent" | "failed" = "sent";
    try {
      await this.mail.send(
        email,
        "총무야 가입 이메일 인증",
        `총무야 가입 인증번호는 ${code}입니다. 10분 안에 입력해 주세요. 요청하지 않았다면 이 메일을 무시해 주세요.`,
        `signup-email/${next.id}`,
      );
    } catch (error) {
      if (!(error instanceof DomainHttpException)) throw error;
      delivery = "failed";
    }
    // No DB transaction or lock spans delivery. An older delivery cannot revive a newer/cancelled request.
    return db.transaction(async (manager) => {
      const row = await manager.findOneOrFail(EmailVerification, {
        where: { requesterHash },
        lock: { mode: "pessimistic_write" },
      });
      if (row.id !== next.id || row.cancelledAt || row.consumedAt)
        throw new DomainHttpException("EMAIL_VERIFICATION_INVALID");
      row.delivery = delivery;
      await manager.save(row);
      return this.view(row);
    });
  }
  async check(
    id: string,
    email: string,
    code: string,
    requester: string | undefined,
    ip: string,
  ) {
    const db = await this.database.connect(),
      owner = this.owner(requester);
    // Separate committed buckets survive code reissue and failed verification transactions.
    await consumeRequestLimit(
      db.manager,
      `email-check-ip:${ip}`,
      EMAIL_LIMITS.checkIp,
    );
    await consumeRequestLimit(
      db.manager,
      `email-check-owner:${owner}`,
      EMAIL_LIMITS.checkIdentity,
    );
    await consumeRequestLimit(
      db.manager,
      `email-check-address:${email}`,
      EMAIL_LIMITS.checkIdentity,
    );
    const result = await db.transaction(async (manager) => {
      const row = await this.current(manager, requester, id, email);
      if (row.failures >= EMAIL_LIMITS.failures)
        throw new DomainHttpException("EMAIL_VERIFICATION_LIMIT");
      if (
        !timingSafeEqual(
          Buffer.from(this.digest(row, code), "hex"),
          Buffer.from(row.codeHash, "hex"),
        )
      ) {
        row.failures++;
        await manager.save(row);
        return {
          error:
            row.failures === EMAIL_LIMITS.failures
              ? ("EMAIL_VERIFICATION_LIMIT" as const)
              : ("EMAIL_VERIFICATION_MISMATCH" as const),
        };
      }
      if (!row.verifiedAt) {
        row.verifiedAt = new Date();
        await manager.save(row);
      }
      return { value: this.view(row) };
    });
    if (result.error) throw new DomainHttpException(result.error);
    return result.value!;
  }
  async cancel(id: string, requester?: string) {
    const db = await this.database.connect();
    await db
      .getRepository(EmailVerification)
      .update(
        { requesterHash: this.owner(requester), id },
        { cancelledAt: new Date() },
      );
  }
  async consume(
    manager: EntityManager,
    requester: string | undefined,
    id: string,
    email: string,
  ) {
    const row = await this.current(manager, requester, id, email);
    if (!row.verifiedAt || row.failures >= EMAIL_LIMITS.failures)
      throw new DomainHttpException("EMAIL_VERIFICATION_REQUIRED");
    row.consumedAt = new Date();
    await manager.save(row);
    return row.verifiedAt;
  }
}
