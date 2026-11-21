import { Injectable } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";
import { consumeRequestLimit } from "../../common/http/request-limit.js";
import { Account } from "./entities/account.entity.js";
import { AuthSession } from "./entities/auth-session.entity.js";
import { PhoneChange } from "./entities/phone-change.entity.js";
import { OctomoService, OCTOMO_RECEIVER } from "./octomo.service.js";
import type { AuthUser } from "./types/auth-user.js";
import { AuthError } from "./exceptions/auth.exception.js";
import { publicAccount } from "./utils/public-account.js";
import { AuthService } from "./auth.service.js";
import type { OwnerDepositAccountInput } from "./dto/request/profile.request.dto.js";
@Injectable()
export class ProfileService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly octomo: OctomoService,
    private readonly auth: AuthService,
  ) {}
  private async account(m: EntityManager, u: AuthUser) {
    const a = await m.findOne(Account, {
      where: { id: u.id },
      lock: { mode: "pessimistic_write" },
    });
    const s = await m.findOne(AuthSession, {
      where: { id: u.sessionId, accountId: u.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!a || !s || s.revokedAt || s.expiresAt <= new Date())
      throw new AuthError("SESSION_INVALID");
    return a;
  }
  async save(u: AuthUser, input: { name: string; nickname?: string }) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const a = await this.account(m, u);
      if (input.nickname !== undefined && a.accountType !== "organizer")
        throw new DomainHttpException("VALIDATION_FAILED");
      a.name = input.name.trim();
      if (!a.name) throw new DomainHttpException("VALIDATION_FAILED");
      if (input.nickname !== undefined) {
        a.nickname = input.nickname.trim();
        if (!a.nickname) throw new DomainHttpException("VALIDATION_FAILED");
      }
      await m.save(a);
      return publicAccount(a);
    });
  }
  async depositAccount(u: AuthUser) {
    if (u.accountType !== "owner")
      throw new DomainHttpException("OWNER_REQUIRED");
    const db = await this.database.connect();
    return {
      depositAccount: await this.auth.ownerDepositAccount(u.id, db.manager),
    };
  }

  async saveDepositAccount(u: AuthUser, input: OwnerDepositAccountInput) {
    if (u.accountType !== "owner")
      throw new DomainHttpException("OWNER_REQUIRED");
    const bank = input.bank.trim(),
      account = input.account.trim(),
      holder = input.holder.trim();
    if (!bank || !holder || account.replace(/\D/g, "").length < 4)
      throw new DomainHttpException("VALIDATION_FAILED");
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      const owner = await this.account(m, u);
      if (
        owner.accountType !== "owner" ||
        owner.withdrawnAt ||
        owner.withdrawalStartedAt
      )
        throw new DomainHttpException("OWNER_REQUIRED");
      const current = await this.auth.ownerDepositAccount(u.id, m);
      if (
        current?.bank === bank &&
        current.account === account &&
        current.holder === holder
      )
        return { depositAccount: current };
      const revision = current?.revision ?? 0;
      if (revision !== input.expectedRevision)
        throw new DomainHttpException("RESERVATION_STATE_CONFLICT");
      const depositAccount = { revision: revision + 1, bank, account, holder };
      await m.update(
        Account,
        { id: u.id },
        { ownerDepositAccount: depositAccount },
      );
      return { depositAccount };
    });
  }
  private message(p: PhoneChange) {
    const code = createHmac("sha256", this.config.environment.authSecret)
      .update(`phone_change:${p.accountId}:${p.sessionId}:${p.id}:${p.phone}`)
      .digest("hex")
      .slice(0, 32)
      .toUpperCase();
    return `총무야 연락처 변경 ${code}`;
  }
  private view(p: PhoneChange) {
    return {
      id: p.id,
      phone: p.phone,
      expiresAt: p.expiresAt.toISOString(),
      retryAt: p.retryAt.toISOString(),
      nextCheckAt: p.nextCheckAt.toISOString(),
      serverNow: new Date().toISOString(),
      checksRemaining: Math.max(0, 12 - p.checks),
      status: p.consumedAt ? "verified" : "pending",
    };
  }
  async issue(u: AuthUser, phone: string, ip: string) {
    this.octomo.assertConfigured();
    const db = await this.database.connect();
    await consumeRequestLimit(db.manager, `phone-change-ip:${ip}`, 30);
    await consumeRequestLimit(db.manager, `phone-change-account:${u.id}`, 5);
    await consumeRequestLimit(db.manager, `phone-change-number:${phone}`, 5);
    const p = await db.transaction(async (m) => {
      await this.account(m, u);
      const old = await m.findOneBy(PhoneChange, { sessionId: u.sessionId });
      if (old && old.retryAt > new Date())
        throw new DomainHttpException("PHONE_VERIFICATION_WAIT");
      return m.save(PhoneChange, {
        sessionId: u.sessionId,
        accountId: u.id,
        id: randomUUID(),
        purpose: "phone_change",
        phone,
        expiresAt: new Date(Date.now() + 300000),
        retryAt: new Date(Date.now() + 60000),
        nextCheckAt: new Date(Date.now() + 10000),
        checks: 0,
        consumedAt: null,
      });
    });
    const message = this.message(p);
    return db.transaction(async (m) => {
      await this.account(m, u);
      const current = await this.current(m, u, p.id, phone);
      return {
        ...this.view(current),
        message,
        receiver: OCTOMO_RECEIVER,
      };
    });
  }
  private async current(
    m: EntityManager,
    u: AuthUser,
    id: string,
    phone: string,
  ) {
    const p = await m.findOne(PhoneChange, {
      where: { sessionId: u.sessionId, accountId: u.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!p || p.id !== id || p.phone !== phone || p.purpose !== "phone_change")
      throw new DomainHttpException("PHONE_VERIFICATION_INVALID");
    if (!p.consumedAt && p.expiresAt <= new Date())
      throw new DomainHttpException("PHONE_VERIFICATION_EXPIRED");
    return p;
  }
  async verify(u: AuthUser, id: string, phone: string) {
    const db = await this.database.connect();
    const p = await db.transaction(async (m) => {
      await this.account(m, u);
      const row = await this.current(m, u, id, phone);
      if (row.consumedAt) return row;
      if (row.checks >= 12)
        throw new DomainHttpException("PHONE_VERIFICATION_LIMIT");
      if (row.nextCheckAt > new Date())
        throw new DomainHttpException("PHONE_VERIFICATION_WAIT");
      row.checks++;
      row.nextCheckAt = new Date(Date.now() + 10000);
      return m.save(row);
    });
    const received = p.consumedAt
      ? true
      : await this.octomo.exists(phone, this.message(p));
    return db.transaction(async (m) => {
      const a = await this.account(m, u);
      const current = await this.current(m, u, id, phone);
      // A consumed proof only acknowledges its own result, never reapplies an old number.
      if (current.consumedAt) {
        if (a.phone !== phone)
          throw new DomainHttpException("PHONE_VERIFICATION_INVALID");
        return { status: "verified", account: publicAccount(a) };
      }
      if (!received) return this.view(current);
      current.consumedAt = new Date();
      a.phone = phone;
      a.phoneVerifiedAt = current.consumedAt;
      await m.save(a);
      await m.save(current);
      return { status: "verified", account: publicAccount(a) };
    });
  }
}
