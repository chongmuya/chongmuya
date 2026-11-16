import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { PhoneVerification } from "./entities/phone-verification.entity.js";
import { AuthAttemptsRepository } from "./repositories/auth-attempts.repository.js";
import { tokenHash } from "./utils/token-hash.js";
import { OctomoService, OCTOMO_RECEIVER } from "./octomo.service.js";

const LIFETIME = 5 * 60_000;
const REQUEST_INTERVAL = 60_000;
const CHECK_INTERVAL = 10_000;
const MAX_CHECKS = 12;

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly attempts: AuthAttemptsRepository,
    private readonly octomo: OctomoService,
  ) {}
  private owner(requester?: string) {
    if (!requester || !/^[A-Za-z0-9_-]{43}$/.test(requester))
      throw new DomainHttpException("PHONE_VERIFICATION_INVALID");
    return tokenHash(requester);
  }
  private message(row: PhoneVerification) {
    const code = createHmac("sha256", this.config.environment.authSecret)
      .update(`signup:${row.requesterHash}:${row.id}:${row.phone}`)
      .digest("hex")
      .slice(0, 32)
      .toUpperCase();
    return `총무야 가입 ${code}`;
  }
  private view(row: PhoneVerification) {
    return {
      id: row.id,
      phone: row.phone,
      status:
        row.expiresAt.getTime() <= Date.now()
          ? ("expired" as const)
          : row.verifiedAt
            ? ("verified" as const)
            : ("pending" as const),
      expiresAt: row.expiresAt.toISOString(),
      retryAt: row.retryAt.toISOString(),
      nextCheckAt: row.nextCheckAt.toISOString(),
      checksRemaining: Math.max(0, MAX_CHECKS - row.checkCount),
      serverNow: new Date().toISOString(),
    };
  }
  private async current(
    manager: EntityManager,
    requester: string | undefined,
    id: string,
    phone?: string,
  ) {
    const row = await manager.findOne(PhoneVerification, {
      where: { requesterHash: this.owner(requester) },
      lock: { mode: "pessimistic_write" },
    });
    if (
      !row ||
      row.id !== id ||
      row.purpose !== "signup" ||
      row.cancelledAt ||
      row.consumedAt ||
      (phone !== undefined && phone !== row.phone)
    )
      throw new DomainHttpException("PHONE_VERIFICATION_INVALID");
    if (row.expiresAt.getTime() <= Date.now())
      throw new DomainHttpException("PHONE_VERIFICATION_EXPIRED");
    return row;
  }
  async create(phone: string, requester: string | undefined, ip: string) {
    this.octomo.assertConfigured();
    const requesterHash = this.owner(requester);
    const db = await this.database.connect();
    await this.attempts.limit(db.manager, `phone-issue-ip:${ip}`, 30);
    await this.attempts.limit(
      db.manager,
      `phone-issue-owner:${requesterHash}`,
      5,
    );
    await this.attempts.limit(db.manager, `phone-issue-number:${phone}`, 5);
    const row = await db.transaction(async (manager) => {
      const now = new Date();
      const next = Object.assign(new PhoneVerification(), {
        requesterHash,
        id: randomUUID(),
        phone,
        purpose: "signup",
        createdAt: now,
        expiresAt: new Date(now.getTime() + LIFETIME),
        retryAt: new Date(now.getTime() + REQUEST_INTERVAL),
        nextCheckAt: new Date(now.getTime() + CHECK_INTERVAL),
        checkCount: 0,
        verifiedAt: null,
        consumedAt: null,
        cancelledAt: null,
      });
      await manager
        .createQueryBuilder()
        .insert()
        .into(PhoneVerification)
        .values(next)
        .orIgnore()
        .execute();
      const previous = await manager.findOneOrFail(PhoneVerification, {
        where: { requesterHash },
        lock: { mode: "pessimistic_write" },
      });
      if (previous.id !== next.id && previous.retryAt.getTime() > Date.now())
        throw new DomainHttpException("PHONE_VERIFICATION_WAIT");
      return manager.save(next);
    });
    // Network I/O is never held inside a database transaction.
    const message = this.message(row);
    const qrCode = await this.octomo.qrCode(message);
    // A concurrent cancellation/reissue cannot revive this challenge.
    return db.transaction(async (manager) => {
      const current = await this.current(manager, requester, row.id, phone);
      return {
        ...this.view(current),
        receiver: OCTOMO_RECEIVER,
        message,
        qrCode,
      };
    });
  }
  async check(id: string, phone: string, requester?: string) {
    const db = await this.database.connect();
    const row = await db.transaction(async (manager) => {
      const current = await this.current(manager, requester, id, phone);
      if (current.verifiedAt) return current;
      if (current.checkCount >= MAX_CHECKS)
        throw new DomainHttpException("PHONE_VERIFICATION_LIMIT");
      if (current.nextCheckAt.getTime() > Date.now())
        throw new DomainHttpException("PHONE_VERIFICATION_WAIT");
      current.checkCount++;
      current.nextCheckAt = new Date(Date.now() + CHECK_INTERVAL);
      return manager.save(current);
    });
    if (row.verifiedAt) return this.view(row);
    const received = await this.octomo.exists(row.phone, this.message(row));
    return db.transaction(async (manager) => {
      const current = await this.current(manager, requester, id, phone);
      // Octomo returns exists, not the SMS receipt timestamp. Record when the server verified it.
      if (received && !current.verifiedAt) {
        current.verifiedAt = new Date();
        await manager.save(current);
      }
      return this.view(current);
    });
  }
  async cancel(id: string, requester?: string) {
    const db = await this.database.connect();
    await db
      .getRepository(PhoneVerification)
      .update(
        { requesterHash: this.owner(requester), id },
        { cancelledAt: new Date() },
      );
  }
  async consume(
    manager: EntityManager,
    requester: string | undefined,
    id: string,
    phone: string,
  ) {
    const row = await this.current(manager, requester, id, phone);
    if (!row.verifiedAt)
      throw new DomainHttpException("PHONE_VERIFICATION_REQUIRED");
    row.consumedAt = new Date();
    await manager.save(row);
    return row.verifiedAt;
  }
}
